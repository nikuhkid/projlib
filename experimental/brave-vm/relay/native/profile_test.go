package main

import (
    "archive/tar"
    "bytes"
    "os"
    "path/filepath"
    "testing"
)

func fixtureFile(t *testing.T, home, name string, data []byte) {
    t.Helper(); filename := filepath.Join(home, name)
    if err := os.MkdirAll(filepath.Dir(filename), 0700); err != nil { t.Fatal(err) }
    if err := os.WriteFile(filename, data, 0600); err != nil { t.Fatal(err) }
}

func TestProfileRoundTripPreservesBinaryRecoveryDataAndSkipsCaches(t *testing.T) {
    source, destination := t.TempDir(), t.TempDir()
    fixtures := map[string][]byte{
        "profile/Local State": []byte(`{"sync":"disposable-fixture"}`),
        "profile/Default/Network/Cookies": {0, 1, 0xff, 4, 0, 5},
        "profile/Default/Network/Cookies-wal": {9, 0, 8, 0xff},
        "profile/Default/Sync Data/LevelDB/000001.log": []byte("recovery-fixture"),
        "profile/Default/Bookmarks": []byte("Olá Niku"),
        ".cache/fontconfig/fixture": []byte("cache-fixture"),
    }
    for name, data := range fixtures { fixtureFile(t, source, name, data) }
    fixtureFile(t, source, "profile/Default/Cache/ignored", []byte("discardable"))
    if err := os.Symlink("/tmp/unrelated-socket", filepath.Join(source, "profile/SingletonSocket")); err != nil { t.Fatal(err) }
    fixtureFile(t, destination, "profile/previous", []byte("previous"))
    archive := filepath.Join(t.TempDir(), "profile.tar")
    size, err := writeProfile(source, archive); if err != nil { t.Fatal(err) }; if size < 512 { t.Fatal("empty archive") }
    if err := readProfile(destination, archive); err != nil { t.Fatal(err) }
    for name, expected := range fixtures {
        actual, err := os.ReadFile(filepath.Join(destination, name)); if err != nil || !bytes.Equal(actual, expected) { t.Fatalf("fixture did not round trip: %s", name) }
    }
    for _, name := range []string{"profile/Default/Cache", "profile/SingletonSocket", "profile/previous"} {
        if _, err := os.Lstat(filepath.Join(destination, name)); !os.IsNotExist(err) { t.Fatalf("unexpected restored entry: %s", name) }
    }
}

func TestUnsafeArchivesCannotAlterThePreviousProfile(t *testing.T) {
    for _, malicious := range []*tar.Header{
        {Name:"profile/../../outside", Typeflag:tar.TypeReg},
        {Name:"/profile/absolute", Typeflag:tar.TypeReg},
        {Name:"profile/symlink", Typeflag:tar.TypeSymlink, Linkname:"../../outside"},
        {Name:"profile/hardlink", Typeflag:tar.TypeLink, Linkname:"profile/sentinel"},
        {Name:"profile/device", Typeflag:tar.TypeChar},
        {Name:"profile/oversized", Typeflag:tar.TypeReg, Size:profileLimit+1},
    } {
        t.Run(malicious.Name, func(t *testing.T) {
            home := t.TempDir(); fixtureFile(t, home, "profile/sentinel", []byte("untouched"))
            filename := filepath.Join(t.TempDir(), "bad.tar")
            output, err := os.Create(filename); if err != nil { t.Fatal(err) }
            writer := tar.NewWriter(output)
            if err := writer.WriteHeader(&tar.Header{Name:"profile", Typeflag:tar.TypeDir, Mode:0700}); err != nil { t.Fatal(err) }
            if err := writer.WriteHeader(malicious); err != nil { t.Fatal(err) }
            _ = writer.Close(); _ = output.Close()
            if readProfile(home, filename) == nil { t.Fatal("unsafe archive accepted") }
            actual, err := os.ReadFile(filepath.Join(home, "profile/sentinel")); if err != nil || string(actual) != "untouched" { t.Fatal("previous profile changed") }
        })
    }
}

func TestDuplicateArchiveFilesDoNotReplaceThePreviousProfile(t *testing.T) {
    home := t.TempDir(); fixtureFile(t, home, "profile/sentinel", []byte("untouched"))
    filename := filepath.Join(t.TempDir(), "duplicate.tar")
    output, err := os.Create(filename); if err != nil { t.Fatal(err) }
    writer := tar.NewWriter(output)
    for _, header := range []*tar.Header{{Name:"profile", Typeflag:tar.TypeDir, Mode:0700}, {Name:"profile/duplicate", Typeflag:tar.TypeReg}, {Name:"profile/duplicate", Typeflag:tar.TypeReg}} {
        if err := writer.WriteHeader(header); err != nil { t.Fatal(err) }
    }
    if err := writer.Close(); err != nil { t.Fatal(err) }; _ = output.Close()
    if readProfile(home, filename) == nil { t.Fatal("duplicate files accepted") }
    actual, err := os.ReadFile(filepath.Join(home, "profile/sentinel")); if err != nil || string(actual) != "untouched" { t.Fatal("previous profile changed") }
}
