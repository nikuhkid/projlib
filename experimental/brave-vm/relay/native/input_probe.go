package main

import (
    "bytes"
    "fmt"
    "io"
    "net"
    "os"
    "runtime"
    "strings"
    "time"
)

// A synthetic input sink for the disposable guest. It verifies the entire real
// serial/TTY path without waiting for Brave or logging any user input.
func runGuestInputProbe() error {
    if runtime.GOOS != "linux" || os.Getuid() != 1000 || os.Getenv("HOME") != "/home/browser" {
        return fmt.Errorf("this fixture runs only in the isolated guest")
    }
    listener, err := net.Listen("tcp4", "127.0.0.1:5900")
    if err != nil { return err }; defer listener.Close()
    result := make(chan error, 1)
    go func() {
        connection, err := listener.Accept()
        if err != nil { result <- err; return }; defer connection.Close()
        _ = connection.SetDeadline(time.Now().Add(60*time.Second))
        expected := []byte(strings.Repeat("projlib-disposable-input-fixture:", 400))
        received := make([]byte, len(expected))
        if _, err = io.ReadFull(connection, received); err != nil { result <- err; return }
        if !bytes.Equal(received, expected) { result <- fmt.Errorf("input mismatch"); return }
        fmt.Println("PROJLIB_INPUT_PROBE_PASS")
        result <- nil
    }()
    if err = runGuestDisplay(); err != nil { return err }
    return <-result
}
