package main

import (
    "fmt"
    "golang.org/x/image/font"
    "golang.org/x/image/font/basicfont"
    "golang.org/x/image/math/fixed"
    "image"
    "image/color"
    "image/draw"
    "image/jpeg"
    "log"
    "math/rand"
    "net"
    "os"
    "time"
)

func main() {
    for {
        t := time.Now()
        filename := fmt.Sprintf("remote-%04d%02d%02d-%02d:%02d:%02d.jpg",
            t.Year(), t.Month(), t.Day(),
            t.Hour(), t.Minute(), t.Second())
        out, err := os.Create(filename)
        if err != nil {
            log.Println("os.Create() error: " + err.Error())
        }

        // generate random light-colored image
        img := image.NewRGBA(image.Rect(0, 0, 250, 250))
        rand.Seed(t.UnixNano())
        rr := uint8(rand.Intn(127) + 127)
        rg := uint8(rand.Intn(127) + 127)
        rb := uint8(rand.Intn(127) + 127)
        color := color.RGBA{rr, rg, rb, 255}
        draw.Draw(img, img.Bounds(), &image.Uniform{color}, image.ZP, draw.Src)

        // add time to img
        x, y := 5, 100
        addImgLabel(img, x, y, t.Format(time.RFC850))

        // add hostname to img
        name, err := os.Hostname()
        if err != nil {
            log.Println("os.Hostname() error: " + err.Error())
        }
        y += 20
        addImgLabel(img, x, y, name)

        // add address to img
        addrs, err := net.InterfaceAddrs()
        if err != nil {
            log.Println("net.InterfaceAddrs() error: " + err.Error())
        }
        for _, a := range addrs {
            if ipnet, ok := a.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
                if ipnet.IP.To4() != nil {
                    y += 20
                    addrStr := fmt.Sprintf("%s (%s)", ipnet.IP.String(), a.Network())
                    addImgLabel(img, x, y, addrStr)
                }
            }
        }

        var opt jpeg.Options
        opt.Quality = 100
        err = jpeg.Encode(out, img, &opt)
        if err != nil {
            log.Println("jpeg.Encode() error: " + err.Error())
        }

        time.Sleep(120 * time.Second)
    }
}

// Configures font to render label at x, y on the img.
func addImgLabel(img *image.RGBA, x, y int, label string) {
    col := color.RGBA{0, 0, 0, 255}
    point := fixed.Point26_6{fixed.Int26_6(x * 64), fixed.Int26_6(y * 64)}
    d := &font.Drawer{
        Dst:  img,
        Src:  image.NewUniform(col),
        Face: basicfont.Face7x13,
        Dot:  point,
    }
    d.DrawString(label)
}
