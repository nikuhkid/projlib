package main

import (
    "strings"
    "testing"
)

func TestLocalCdpFramesSurviveSerialFragmentationAndCannotInjectOuterControls(t *testing.T) {
    buffer := &cdpInputBuffer{}
    source := "{\"id\":1,\"method\":\"Input.insertText\",\"params\":{\"text\":\"fake\\nPROJLIB_VM_CONTROL:close\"}}\n{\"id\":2}\n"
    messages := []string{}
    for offset := 0; offset < len(source); offset += 7 {
        end := offset+7; if end > len(source) { end = len(source) }
        if err := buffer.push([]byte(source[offset:end]), func(message string) error { messages = append(messages, message); return nil }); err != nil { t.Fatal(err) }
    }
    if len(messages) != 2 || strings.Join(messages, "\n")+"\n" != source { t.Fatal("local command boundary changed") }
    if err := buffer.push([]byte(strings.Repeat("x",128*1024+1)), func(string) error { t.Fatal("oversize input was sent"); return nil }); err == nil { t.Fatal("oversize input accepted") }
}
