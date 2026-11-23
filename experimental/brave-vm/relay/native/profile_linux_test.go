package main

import (
    "os"
    "os/exec"
    "path/filepath"
    "strconv"
    "strings"
    "testing"
    "time"
)

func TestSnapshotPauseResumesOnlyItsSelectedFixtureProcess(t *testing.T) {
    command := exec.Command("sleep", "30")
    if err := command.Start(); err != nil { t.Fatal(err) }
    defer func() { _ = command.Process.Kill(); _ = command.Wait() }()
    resume, err := pauseSelectedBrowser(func() ([]int, error) { return []int{command.Process.Pid}, nil })
    if err != nil { t.Fatal(err) }; defer resume()
    statusFile := filepath.Join("/proc", strconv.Itoa(command.Process.Pid), "status")
    status, err := os.ReadFile(statusFile); if err != nil || !strings.Contains(string(status), "T (stopped)") { t.Fatal("fixture was not paused") }
    resume(); resume()
    deadline := time.Now().Add(time.Second)
    for time.Now().Before(deadline) {
        status, err := os.ReadFile(statusFile)
        if err == nil && !strings.Contains(string(status), "T (stopped)") { return }
        time.Sleep(10*time.Millisecond)
    }
    t.Fatal("fixture was not resumed")
}

func TestNormalStopAllowsSelectedProcessToFlushAndLeavesAnotherProcessAlive(t *testing.T) {
    directory := t.TempDir()
    marker := filepath.Join(directory, "flushed")
    ready := filepath.Join(directory, "ready")
    selected := exec.Command("sh", "-c", `trap 'printf flushed > "$1"; exit 0' TERM; printf ready > "$2"; while :; do sleep 0.05; done`, "fixture", marker, ready)
    other := exec.Command("sleep", "30")
    if err := selected.Start(); err != nil { t.Fatal(err) }
    defer func() { _ = selected.Process.Kill(); _ = selected.Wait() }()
    if err := other.Start(); err != nil { t.Fatal(err) }
    defer func() { _ = other.Process.Kill(); _ = other.Wait() }()
    deadline := time.Now().Add(time.Second)
    for { if _, err := os.Stat(ready); err == nil { break }; if time.Now().After(deadline) { t.Fatal("fixture was not ready") }; time.Sleep(10*time.Millisecond) }
    selector := func() ([]int, error) { return []int{selected.Process.Pid}, nil }
    if err := stopSelectedBrowser(selector, selector, time.Second); err != nil { t.Fatal(err) }
    if content, err := os.ReadFile(marker); err != nil || string(content) != "flushed" { t.Fatal("selected process did not flush before closing") }
    status, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(other.Process.Pid), "status"))
    if err != nil || strings.Contains(string(status), "Z (zombie)") { t.Fatal("another process was affected") }
}
