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
