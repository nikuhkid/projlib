package main

import "errors"

func guestBrowserPIDs() ([]int, error) { return nil, errors.New("guest profiles are unavailable on the host") }
func pauseGuestBrowser() (func(), error) { return nil, errors.New("guest profiles are unavailable on the host") }
func closeGuestBrowser() error { return errors.New("guest profiles are unavailable on the host") }
