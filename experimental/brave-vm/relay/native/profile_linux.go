package main

import (
    "errors"
    "os"
    "path/filepath"
    "strconv"
    "strings"
    "sync"
    "syscall"
    "time"
)

func guestBrowserPIDs() ([]int, error) {
    entries, err := os.ReadDir("/proc"); if err != nil { return nil, err }
    pids := []int{}
    for _, entry := range entries {
        pid, err := strconv.Atoi(entry.Name()); if err != nil { continue }
        base := filepath.Join("/proc", entry.Name())
        executable, _ := os.Readlink(filepath.Join(base, "exe"))
        command, _ := os.ReadFile(filepath.Join(base, "cmdline"))
        first := strings.SplitN(string(command), "\x00", 2)[0]
        name, _ := os.ReadFile(filepath.Join(base, "comm"))
        if strings.TrimSuffix(executable, " (deleted)") == "/opt/brave.com/brave/brave" || first == "/opt/brave.com/brave/brave" || strings.TrimSpace(string(name)) == "brave-browser" { pids = append(pids, pid) }
    }
    return pids, nil
}

func pauseGuestBrowser() (func(), error) {
    return pauseSelectedBrowser(guestBrowserPIDs)
}

func pauseSelectedBrowser(selectPIDs func() ([]int, error)) (func(), error) {
    paused := map[int]bool{}; var once sync.Once
    resume := func() { once.Do(func() { for pid := range paused { _ = syscall.Kill(pid, syscall.SIGCONT) } }) }
    deadline := time.Now().Add(10*time.Second)
    for {
        pids, err := selectPIDs(); if err != nil { resume(); return nil, err }
        added := false
        for _, pid := range pids {
            if paused[pid] { continue }
            if err := syscall.Kill(pid, syscall.SIGSTOP); err != nil { if errors.Is(err, syscall.ESRCH) { continue }; resume(); return nil, err }
            paused[pid] = true; added = true
        }
        stopped := true
        for pid := range paused {
            tasks, err := os.ReadDir(filepath.Join("/proc", strconv.Itoa(pid), "task")); if errors.Is(err, os.ErrNotExist) { continue }; if err != nil { resume(); return nil, err }
            for _, task := range tasks {
                status, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(pid), "task", task.Name(), "status")); if errors.Is(err, os.ErrNotExist) { continue }; if err != nil { resume(); return nil, err }
                for _, line := range strings.Split(string(status), "\n") {
                    if strings.HasPrefix(line, "State:") && !strings.Contains(line, "T (stopped)") && !strings.Contains(line, "Z (zombie)") { stopped = false }
                }
            }
        }
        if stopped && !added { return resume, nil }
        if time.Now().After(deadline) { resume(); return nil, errors.New("the browser could not pause for its snapshot") }
        time.Sleep(20*time.Millisecond)
    }
}
