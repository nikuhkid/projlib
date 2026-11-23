package main

import (
    "encoding/json"
    "errors"
    "fmt"
    "net/http"
    "net/url"
    "time"

    "golang.org/x/net/websocket"
)

// Disposable blank-guest diagnostic only. This loopback endpoint stays inside
// the local Wasm guest; no DevTools connection goes to Wolfie or a website.
func connectGuestDevTools() (*websocket.Conn, error) {
    if err := guestProfileGuard(); err != nil { return nil, err }
    // Full CPU emulation can spend several seconds handling the first internal
    // HTTP request. A two-second timeout can abort before a cold endpoint answers.
    client := &http.Client{Timeout: 15*time.Second}
    deadline := time.Now().Add(10*time.Minute)
    var version struct { WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"` }
    for time.Now().Before(deadline) {
        response, err := client.Get("http://127.0.0.1:9222/json/version")
        if err == nil {
            err = json.NewDecoder(response.Body).Decode(&version); _ = response.Body.Close()
            if err == nil && version.WebSocketDebuggerURL != "" { break }
        }
        time.Sleep(250*time.Millisecond)
    }
    endpoint, err := url.Parse(version.WebSocketDebuggerURL)
    if err != nil || endpoint.Scheme != "ws" || endpoint.Hostname() != "127.0.0.1" || endpoint.Port() != "9222" { return nil, errors.New("guest diagnostic endpoint unavailable") }
    config, err := websocket.NewConfig(endpoint.String(), "http://localhost"); if err != nil { return nil, err }
    connection, err := websocket.DialConfig(config); if err != nil { return nil, err }
    connection.MaxPayloadBytes = 1024*1024
    return connection, nil
}

func runGuestRenderProbe() error {
    connection, err := connectGuestDevTools(); if err != nil { return err }; defer connection.Close()
    sequence := 0
    call := func(method string, params any, session string, result any) error {
        sequence++
        _ = connection.SetDeadline(time.Now().Add(30*time.Second))
        request := map[string]any{"id":sequence, "method":method, "params":params}
        if session != "" { request["sessionId"] = session }
        if err := websocket.JSON.Send(connection, request); err != nil { return err }
        for {
            var response struct { ID int `json:"id"`; Result json.RawMessage `json:"result"`; Error json.RawMessage `json:"error"` }
            if err := websocket.JSON.Receive(connection, &response); err != nil { return err }
            if response.ID != sequence { continue }
            if len(response.Error) != 0 { return errors.New("guest diagnostic command failed") }
            if result != nil { return json.Unmarshal(response.Result, result) }; return nil
        }
    }
    var targets struct { Infos []struct { ID string `json:"targetId"`; Type string `json:"type"` } `json:"targetInfos"` }
    if err := call("Target.getTargets", map[string]any{}, "", &targets); err != nil { return err }
    target := ""
    for _, item := range targets.Infos { if item.Type == "page" { target = item.ID; break } }
    if target == "" { return errors.New("guest browser page unavailable") }
    var attached struct { Session string `json:"sessionId"` }
    if err := call("Target.attachToTarget", map[string]any{"targetId":target,"flatten":true}, "", &attached); err != nil { return err }
    html := "<title>ProjLib Brave engine probe</title><p id=\"proof\">Actual Brave executed inside the guest</p>"
    if err := call("Page.navigate", map[string]any{"url":"data:text/html,"+url.PathEscape(html)}, attached.Session, nil); err != nil { return err }
    deadline := time.Now().Add(2*time.Minute)
    for time.Now().Before(deadline) {
        var evaluated struct { Result struct { Value string `json:"value"` } `json:"result"` }
        if err := call("Runtime.evaluate", map[string]any{"expression":"document.getElementById(\"proof\")?.textContent", "returnByValue":true}, attached.Session, &evaluated); err != nil { return err }
        if evaluated.Result.Value == "Actual Brave executed inside the guest" {
            fmt.Println("PROJLIB_CONTROLLED_DOM_PASS")
            _ = call("Browser.close", map[string]any{}, "", nil)
            return nil
        }
        time.Sleep(250*time.Millisecond)
    }
    return errors.New("guest HTML did not render")
}
