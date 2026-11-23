package main

import (
    "context"
    "crypto/subtle"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "io"
    "net"
    "net/http"
    "os"
    "sync"
    "sync/atomic"
    "time"

    "github.com/containers/gvisor-tap-vsock/pkg/types"
    "github.com/containers/gvisor-tap-vsock/pkg/virtualnetwork"
    "golang.org/x/net/websocket"
)

// One helper process belongs to one browser connection. The Node host authenticates
// the browser and filters Ethernet packets before forwarding to this loopback socket.
// Exiting the process releases the entire guest network stack and its native sockets.
func main() {
    if len(os.Args) == 2 && (os.Args[1] == "--profile-import" || os.Args[1] == "--profile-export") {
        if runGuestProfile(os.Args[1]) != nil { fmt.Println("PROJLIB_PROFILE_FAILED"); os.Exit(1) }
        return
    }
    if len(os.Args) == 2 && os.Args[1] == "--rfb-stdio" {
        if runGuestDisplay() != nil { os.Exit(1) }
        return
    }
    var config struct { Key string `json:"key"` }
    decoder := json.NewDecoder(io.LimitReader(os.Stdin, 4096))
    decoder.DisallowUnknownFields()
    if decoder.Decode(&config) != nil { os.Exit(2) }
    key, err := hex.DecodeString(config.Key)
    if err != nil || len(key) != 32 { os.Exit(2) }
    listener, err := net.Listen("tcp4", "127.0.0.1:0")
    if err != nil { os.Exit(3) }
    defer listener.Close()
    done := make(chan struct{})
    var once sync.Once
    var accepted atomic.Bool
    finish := func() { once.Do(func() { close(done) }) }
    mux := http.NewServeMux()
    mux.HandleFunc("/relay", func(w http.ResponseWriter, r *http.Request) {
        candidate, err := hex.DecodeString(r.Header.Get("X-ProjLib-Relay-Instance"))
        if err != nil || len(candidate) != len(key) || subtle.ConstantTimeCompare(candidate, key) != 1 {
            http.Error(w, "Unauthorized", http.StatusUnauthorized); return
        }
        if !accepted.CompareAndSwap(false, true) { http.Error(w, "Already connected", http.StatusConflict); return }
        websocket.Handler(func(ws *websocket.Conn) {
            defer finish()
            defer ws.Close()
            ws.PayloadType = websocket.BinaryFrame
            ws.MaxPayloadBytes = 1024 * 1024
            vn, err := virtualnetwork.New(&types.Configuration{
                MTU: 1500, Subnet: "192.168.127.0/24", GatewayIP: "192.168.127.1",
                GatewayMacAddress: "5a:94:ef:e4:0c:dd",
                DHCPStaticLeases: map[string]string{"192.168.127.3": "02:00:00:00:00:01"},
                Protocol: types.QemuProtocol,
                // No host-loopback NAT or forwarded host ports.
            })
            if err != nil { return }
            _ = vn.AcceptQemu(context.Background(), ws)
        }).ServeHTTP(w, r)
    })
    server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, MaxHeaderBytes: 8192}
    go func() { _ = server.Serve(listener); finish() }()
    fmt.Printf("{\"port\":%d}\n", listener.Addr().(*net.TCPAddr).Port)
    timer := time.NewTimer(30 * time.Second)
    defer timer.Stop()
    select {
    case <-done:
    case <-timer.C:
        if !accepted.Load() { return }
        <-done
    }
    _ = server.Close()
}
