package main

import (
    "archive/tar"
    "errors"
    "fmt"
    "io"
    "io/fs"
    "os"
    "path"
    "path/filepath"
    "runtime"
    "strings"
)

const profileLimit = int64(256 * 1024 * 1024)
var errProfileLimit = errors.New("profile snapshot exceeds its limit")

type boundedProfileWriter struct { destination io.Writer; written int64 }
func (w *boundedProfileWriter) Write(data []byte) (int, error) {
    if int64(len(data)) > profileLimit-w.written { return 0, errProfileLimit }
    n, err := w.destination.Write(data); w.written += int64(n); return n, err
}

func excludedProfileEntry(name string, entry fs.DirEntry) bool {
    if entry.Type()&os.ModeSymlink != 0 { return true }
    if strings.HasPrefix(entry.Name(), "Singleton") || entry.Name() == "DevToolsActivePort" { return true }
    if !entry.IsDir() { return false }
    switch entry.Name() {
    case "Cache", "Code Cache", "GPUCache", "ShaderCache", "GrShaderCache", "GraphiteDawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "Crashpad", "BrowserMetrics", "CacheStorage", "optimization_guide_model_store": return true
    }
    return false
}

// The browser is paused by the caller. Include recovery journals, cookies,
// Local State and Sync databases, but no sockets, symlinks or disposable caches.
func writeProfile(home, archive string) (int64, error) {
    output, err := os.OpenFile(archive, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
    if err != nil { return 0, err }; defer output.Close()
    bounded := &boundedProfileWriter{destination: output}
    writer := tar.NewWriter(bounded)
    entries := 0
    for _, item := range []struct{ source, target string }{{"profile", "profile"}, {".cache/fontconfig", "font-cache"}} {
        source := filepath.Join(home, item.source)
        if _, err := os.Stat(source); errors.Is(err, os.ErrNotExist) { continue } else if err != nil { return 0, err }
        err = filepath.WalkDir(source, func(filename string, entry fs.DirEntry, walkErr error) error {
            if walkErr != nil { return walkErr }
            if excludedProfileEntry(filename, entry) { if entry.IsDir() { return filepath.SkipDir }; return nil }
            info, err := entry.Info(); if err != nil { return err }
            if !info.IsDir() && !info.Mode().IsRegular() { return nil }
            entries++; if entries > 100000 || info.Size() > profileLimit { return errProfileLimit }
            relative, err := filepath.Rel(source, filename); if err != nil { return err }
            header, err := tar.FileInfoHeader(info, ""); if err != nil { return err }
            header.Name = path.Join(item.target, filepath.ToSlash(relative))
            header.Uname = ""; header.Gname = ""; header.Uid = 1000; header.Gid = 1000
            if err := writer.WriteHeader(header); err != nil { return err }
            if !info.Mode().IsRegular() { return nil }
            input, err := os.Open(filename); if err != nil { return err }
            _, copyErr := io.CopyN(writer, input, info.Size()); closeErr := input.Close()
            if copyErr != nil { return copyErr }; return closeErr
        })
        if err != nil { return 0, err }
    }
    if err := writer.Close(); err != nil { return 0, err }
    if err := output.Sync(); err != nil { return 0, err }
    return bounded.written, nil
}

func validProfileName(name string) (string, error) {
    if len(name) > 4096 || strings.ContainsAny(name, "\\\x00") || strings.HasPrefix(name, "/") { return "", errors.New("invalid profile path") }
    trimmed := strings.TrimSuffix(name, "/")
    clean := path.Clean(trimmed)
    if clean != trimmed || !(clean == "profile" || strings.HasPrefix(clean, "profile/") || clean == "font-cache" || strings.HasPrefix(clean, "font-cache/")) { return "", errors.New("invalid profile path") }
    return clean, nil
}

// Validate the complete archive before changing the current profile. Link
// entries are rejected, and extraction uses a new, private staging directory.
func scanProfile(archive *os.File, visit func(*tar.Header, string, *tar.Reader) error) error {
    if _, err := archive.Seek(0, io.SeekStart); err != nil { return err }
    reader := tar.NewReader(archive); count := 0; total := int64(0); hasProfile := false
    for {
        header, err := reader.Next(); if err == io.EOF { break }; if err != nil { return err }
        count++; if count > 100000 { return errProfileLimit }
        name, err := validProfileName(header.Name); if err != nil { return err }
        if header.Typeflag != tar.TypeDir && header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA { return errors.New("profile links and special files are prohibited") }
        if (name == "profile" || name == "font-cache") && header.Typeflag != tar.TypeDir { return errors.New("profile root must be a directory") }
        if header.Size < 0 || header.Size > profileLimit-total { return errProfileLimit }; total += header.Size
        if name == "profile" { hasProfile = true }
        if visit != nil { if err := visit(header, name, reader); err != nil { return err } }
    }
    if !hasProfile { return errors.New("profile directory is missing") }; return nil
}

func readProfile(home, archiveName string) error {
    archive, err := os.Open(archiveName); if err != nil { return err }; defer archive.Close()
    info, err := archive.Stat(); if err != nil { return err }
    if info.Size() == 0 { return nil }; if info.Size() > profileLimit { return errProfileLimit }
    if err := scanProfile(archive, nil); err != nil { return err }
    stage, err := os.MkdirTemp(home, ".projlib-profile-"); if err != nil { return err }; defer os.RemoveAll(stage)
    err = scanProfile(archive, func(header *tar.Header, name string, reader *tar.Reader) error {
        filename := filepath.Join(stage, filepath.FromSlash(name))
        if header.Typeflag == tar.TypeDir { return os.MkdirAll(filename, 0700) }
        if err := os.MkdirAll(filepath.Dir(filename), 0700); err != nil { return err }
        output, err := os.OpenFile(filename, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600); if err != nil { return err }
        _, copyErr := io.CopyN(output, reader, header.Size); closeErr := output.Close()
        if copyErr != nil { return copyErr }; return closeErr
    })
    if err != nil { return err }
    type replacement struct { destination, backup string; hadPrevious, hadEmpty bool }
    committed := []replacement{}
    rollback := func() { for index := len(committed)-1; index >= 0; index-- { item := committed[index]; _ = os.RemoveAll(item.destination); if item.hadPrevious { _ = os.Rename(item.backup, item.destination) } else if item.hadEmpty { _ = os.MkdirAll(item.destination, 0700) } } }
    for _, item := range []struct{ source, destination string }{{"profile", "profile"}, {"font-cache", ".cache/fontconfig"}} {
        source := filepath.Join(stage, item.source)
        if _, err := os.Stat(source); errors.Is(err, os.ErrNotExist) { continue } else if err != nil { rollback(); return err }
        destination := filepath.Join(home, item.destination)
        if err := os.MkdirAll(filepath.Dir(destination), 0700); err != nil { rollback(); return err }
        previous := replacement{destination: destination, backup: filepath.Join(stage, ".previous-"+item.source)}
        if err := os.Rename(destination, previous.backup); err == nil { previous.hadPrevious = true } else if !errors.Is(err, os.ErrNotExist) {
            // OverlayFS can refuse renaming the image's empty lower directory.
            // Remove only that empty placeholder; retain any nonempty profile.
            entries, readErr := os.ReadDir(destination)
            if readErr != nil || len(entries) != 0 { rollback(); return err }
            if removeErr := os.Remove(destination); removeErr != nil { rollback(); return removeErr }
            previous.hadEmpty = true
        }
        committed = append(committed, previous)
        if err := os.Rename(source, destination); err != nil { rollback(); return err }
    }
    return nil
}

func guestProfileGuard() error {
    if runtime.GOOS != "linux" || os.Getuid() != 1000 || os.Getenv("HOME") != "/home/browser" { return errors.New("profile controls run only in the browser guest") }
    return nil
}

func exportGuestProfile() (int64, error) {
    if err := guestProfileGuard(); err != nil { return 0, err }
    resume, err := pauseGuestBrowser(); if err != nil { return 0, err }; defer resume()
    return writeProfile("/home/browser", "/.vm/profile-export.tar")
}

func runGuestProfile(mode string) error {
    if err := guestProfileGuard(); err != nil { return err }
    switch mode {
    case "--profile-import":
        pids, err := guestBrowserPIDs(); if err != nil { return err }; if len(pids) != 0 { return errors.New("close Brave before restoring a profile") }
        if err := readProfile("/home/browser", "/.vm/profile-import.tar"); err != nil { return err }
        fmt.Println("PROJLIB_PROFILE_IMPORTED"); return nil
    case "--profile-export":
        size, err := exportGuestProfile(); if err != nil { return err }
        fmt.Printf("PROJLIB_PROFILE_READY:%d\n", size); return nil
    }
    return errors.New("unknown profile control")
}
