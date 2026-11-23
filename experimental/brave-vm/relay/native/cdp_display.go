package main

import (
    "bufio"
    "bytes"
    "encoding/base64"
    "errors"
    "fmt"
    "io"
    "os"
    "os/exec"
    "strings"
    "sync"
    "sync/atomic"

    "golang.org/x/net/websocket"
)

type cdpInputBuffer struct { pending []byte }
func (buffer *cdpInputBuffer) push(decoded []byte, send func(string) error) error {
    if len(buffer.pending)+len(decoded) > 128*1024 { return errors.New("local browser input exceeds its limit") }
    buffer.pending = append(buffer.pending, decoded...)
    for {
        newline := bytes.IndexByte(buffer.pending, '\n'); if newline < 0 { return nil }
        command := string(buffer.pending[:newline]); buffer.pending = buffer.pending[newline+1:]
        if command != "" { if err := send(command); err != nil { return err } }
    }
}

// This socket and all image/input data stay inside the visitor's Wasm guest and
// browser tab. Wolfie receives only Ethernet through the separate relay.
func runGuestCdpDisplay() error {
    connection, err := connectGuestDevTools(); if err != nil { return err }; defer connection.Close()
    raw := exec.Command("stty", "raw", "-echo"); raw.Stdin = os.Stdin; _ = raw.Run()
    fmt.Print("\nPROJLIB_PROFILE_CAPABLE:1\nPROJLIB_INPUT_ACK_CAPABLE:1\nPROJLIB_CLOSE_CAPABLE:1\nPROJLIB_CDP_READY\n")
    var saving atomic.Bool
    var snapshots sync.WaitGroup
    go func() {
        scanner := bufio.NewScanner(os.Stdin); scanner.Buffer(make([]byte, 4096), 131072)
        input := &cdpInputBuffer{}
        for scanner.Scan() {
            line := scanner.Text()
            if line == "PROJLIB_VM_CONTROL:save" || line == "PROJLIB_VM_CONTROL:close" {
                closing := line == "PROJLIB_VM_CONTROL:close"
                if saving.CompareAndSwap(false, true) {
                    snapshots.Add(1)
                    go func() {
                        defer saving.Store(false); defer snapshots.Done()
                        if closing { if err := closeGuestBrowser(); err != nil { fmt.Print("PROJLIB_PROFILE_FAILED\n"); return } }
                        size, err := exportGuestProfile(); if err != nil { fmt.Print("PROJLIB_PROFILE_FAILED\n"); return }
                        if closing { fmt.Print("PROJLIB_BROWSER_STOPPED\n") }
                        fmt.Printf("PROJLIB_PROFILE_READY:%d\n", size)
                    }()
                }
                continue
            }
            if !strings.HasPrefix(line, "PROJLIB_CDP_INPUT:") { continue }
            decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(line, "PROJLIB_CDP_INPUT:"))
            if err != nil || len(decoded) > 65536 { continue }
            if err := input.push(decoded, func(command string) error { return websocket.Message.Send(connection, command) }); err != nil { break }
            fmt.Print("PROJLIB_CDP_INPUT_ACK\n")
        }
        _ = connection.Close()
    }()
    for {
        var message string
        if err := websocket.Message.Receive(connection, &message); err != nil {
            // Browser shutdown closes DevTools before the final archive is done.
            // Let the already-running save publish its size before closing serial.
            snapshots.Wait()
            fmt.Print("\nPROJLIB_CDP_CLOSED\n")
            if err == io.EOF { return nil }; return err
        }
        if _, err := fmt.Fprintf(os.Stdout, "PROJLIB_CDP_DATA:%s\n", base64.StdEncoding.EncodeToString([]byte(message+"\n"))); err != nil { return err }
    }
}
