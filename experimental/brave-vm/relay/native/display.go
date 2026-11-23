package main

import (
    "bufio"
    "encoding/base64"
    "fmt"
    "io"
    "net"
    "os"
    "os/exec"
    "strings"
    "time"
)

// This mode runs inside the visitor's Wasm guest. RFB bytes travel over its
// emulated serial console to the same browser tab, never through the Wolfie relay.
func runGuestDisplay() error {
    var connection net.Conn
    var err error
    for attempt := 0; attempt < 120; attempt++ {
        connection, err = net.DialTimeout("tcp4", "127.0.0.1:5900", time.Second)
        if err == nil { break }
        time.Sleep(500 * time.Millisecond)
    }
    if connection == nil { return fmt.Errorf("guest display unavailable") }
    defer connection.Close()
    raw := exec.Command("stty", "raw", "-echo")
    raw.Stdin = os.Stdin
    _ = raw.Run()
    fmt.Print("\nPROJLIB_RFB_READY\n")
    go func() {
        scanner := bufio.NewScanner(os.Stdin)
        scanner.Buffer(make([]byte, 4096), 131072)
        for scanner.Scan() {
            line := scanner.Text()
            if !strings.HasPrefix(line, "PROJLIB_RFB_INPUT:") { continue }
            decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(line, "PROJLIB_RFB_INPUT:"))
            if err != nil || len(decoded) > 65536 { continue }
            if _, err := connection.Write(decoded); err != nil { break }
        }
        _ = connection.Close()
    }()
    buffer := make([]byte, 16384)
    for {
        size, err := connection.Read(buffer)
        if size > 0 {
            // The browser consumes this channel without logging its screen contents.
            if _, writeErr := fmt.Fprintf(os.Stdout, "PROJLIB_RFB_DATA:%s\n", base64.StdEncoding.EncodeToString(buffer[:size])); writeErr != nil { return writeErr }
        }
        if err != nil {
            fmt.Print("\nPROJLIB_RFB_CLOSED\n")
            if err == io.EOF { return nil }
            return err
        }
    }
}
