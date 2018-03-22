// scion-imgdemo-server application
// Remote image test app based on: https://github.com/perrig/scionlab/tree/master/cameraapp
package main

import (
    "encoding/binary"
    "flag"
    "fmt"
    "github.com/scionproto/scion/go/lib/snet"
    "golang.org/x/image/font"
    "golang.org/x/image/font/basicfont"
    "golang.org/x/image/math/fixed"
    "image"
    "image/color"
    "image/draw"
    "io/ioutil"
    "log"
    "math/rand"
    "net"
    "os"
    "strconv"
    "strings"
    "sync"
    "time"
)

const (
    MaxFileNameLength int = 255

    // After an image was stored for this amount of time, it will be deleted
    MaxFileAge time.Duration = time.Minute * 10

    // Duration after which an image is still available for download, but it will not be listed any more in new requests
    MaxFileAgeGracePeriod time.Duration = time.Minute * 1

    // Interval after which the file system is read to check for new images
    imageReadInterval time.Duration = time.Second * 59
)

type imageFileType struct {
    name     string
    size     uint32
    content  []byte
    readTime time.Time
}

func check(e error) {
    if e != nil {
        log.Fatal(e)
    }
}

var (
    currentFiles     map[string]*imageFileType
    mostRecentFile   string
    currentFilesLock sync.Mutex
)

func createLocalImage() (img image.Image) {
    // generate random light-colored image
    m := image.NewRGBA(image.Rect(0, 0, 250, 250))
    rand.Seed(time.Now().UnixNano())
    rr := uint8(rand.Intn(127) + 127)
    rg := uint8(rand.Intn(127) + 127)
    rb := uint8(rand.Intn(127) + 127)
    color := color.RGBA{rr, rg, rb, 255}
    draw.Draw(m, m.Bounds(), &image.Uniform{color}, image.ZP, draw.Src)

    // add time to img
    x, y := 5, 100
    addImgLabel(m, x, y, time.Now().Format(time.RFC850))

    // add hostname to img
    name, err := os.Hostname()
    if err != nil {
        log.Println("os.Hostname() error: " + err.Error())
    }
    y += 20
    addImgLabel(m, x, y, name)

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
                addImgLabel(m, x, y, addrStr)
            }
        }
    }
    return m
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

func HandleImageFiles() {
    img := createLocalImage()
    for {
        // Read the directory and look for new .jpg images
        direntries, err := ioutil.ReadDir(".")
        check(err)

        for _, entry := range direntries {
            if entry.IsDir() {
                continue
            }
            if !strings.HasSuffix(entry.Name(), ".jpg") {
                continue
            }
            if len(entry.Name()) > MaxFileNameLength {
                continue
            }
            // Check if we've already read in the image
            currentFilesLock.Lock()
            if _, ok := currentFiles[entry.Name()]; !ok {
                fileContents, err := ioutil.ReadFile(entry.Name())
                check(err)
                newFile := imageFileType{entry.Name(), uint32(entry.Size()), fileContents, time.Now()}
                currentFiles[newFile.name] = &newFile
                mostRecentFile = newFile.name
            }
            currentFilesLock.Unlock()
        }
        // Check if an image should be deleted
        now := time.Now()
        currentFilesLock.Lock()
        for k, v := range currentFiles {
            if now.Sub(v.readTime) > MaxFileAge+MaxFileAgeGracePeriod {
                err = os.Remove(k)
                check(err)
                delete(currentFiles, k)
                if k == mostRecentFile {
                    mostRecentFile = ""
                }
            }
        }
        currentFilesLock.Unlock()

        time.Sleep(imageReadInterval)
    }
}

func printUsage() {
    fmt.Println("scion-imgdemo-server -s ServerSCIONAddress")
    fmt.Println("The SCION address is specified as ISD-AS,[IP Address]:Port")
    fmt.Println("Example SCION address 1-1,[127.0.0.1]:42002")
}

func main() {
    currentFiles = make(map[string]*imageFileType)

    go HandleImageFiles()

    var (
        serverAddress string

        err    error
        server *snet.Addr

        udpConnection *snet.Conn
    )

    // Fetch arguments from command line
    flag.StringVar(&serverAddress, "s", "", "Server SCION Address")
    flag.Parse()

    // Create the SCION UDP socket
    if len(serverAddress) > 0 {
        server, err = snet.AddrFromString(serverAddress)
        check(err)
    } else {
        printUsage()
        check(fmt.Errorf("Error, server address needs to be specified with -s"))
    }

    sciondAddr := "/run/shm/sciond/sd" + strconv.Itoa(int(server.IA.I)) + "-" + strconv.Itoa(int(server.IA.A)) + ".sock"
    dispatcherAddr := "/run/shm/dispatcher/default.sock"
    snet.Init(server.IA, sciondAddr, dispatcherAddr)

    udpConnection, err = snet.ListenSCION("udp4", server)
    check(err)

    receivePacketBuffer := make([]byte, 2500)
    sendPacketBuffer := make([]byte, 2500)
    for {
        // Handle client requests
        n, remoteUDPaddress, err := udpConnection.ReadFrom(receivePacketBuffer)
        if err != nil {
            continue
            // Uncomment and remove "continue" on previous line once the new version of snet is part of the SCIONLab branch
            // if operr, ok := err.(*snet.OpError); ok {
            // 	// This is an OpError, could be SCMP, in which case continue
            // 	if operr.SCMP() != nil {
            // 		continue
            // 	}
            // }
            // If it's not an snet SCMP error, then it's something more serious and fail
            check(err)
        }
        if n > 0 {
            if receivePacketBuffer[0] == 'L' {
                // We also need to lock access to mostRecentFile, otherwise a race condition is possible
                // where the file is deleted after the initial check
                currentFilesLock.Lock()
                sendLen := len(mostRecentFile)
                if sendLen == 0 {
                    currentFilesLock.Unlock()
                    continue
                }
                sendPacketBuffer[0] = 'L'
                sendPacketBuffer[1] = byte(sendLen)
                copy(sendPacketBuffer[2:], []byte(mostRecentFile))
                sendLen = sendLen + 2
                binary.LittleEndian.PutUint32(sendPacketBuffer[sendLen:], currentFiles[mostRecentFile].size)
                currentFilesLock.Unlock()
                sendLen = sendLen + 4
                n, err = udpConnection.WriteTo(sendPacketBuffer[:sendLen], remoteUDPaddress)
                check(err)
            } else if receivePacketBuffer[0] == 'G' && n > 1 {
                filenameLen := int(receivePacketBuffer[1])
                if n >= (2 + filenameLen + 8) {
                    filename := string(receivePacketBuffer[2 : filenameLen+2])
                    currentFilesLock.Lock()
                    v, ok := currentFiles[filename]
                    // We don't need to lock any more, since we now have a pointer to the image structure
                    // which does not get changed once set up.
                    currentFilesLock.Unlock()
                    if !ok {
                        continue
                    }
                    startByte := binary.LittleEndian.Uint32(receivePacketBuffer[filenameLen+2:])
                    endByte := binary.LittleEndian.Uint32(receivePacketBuffer[filenameLen+6:])
                    if endByte > startByte && endByte <= v.size+1 {
                        sendPacketBuffer[0] = 'G'
                        // Copy startByte and endByte from request packet
                        copy(sendPacketBuffer[1:], receivePacketBuffer[filenameLen+2:filenameLen+10])
                        // Copy image contents
                        copy(sendPacketBuffer[9:], v.content[startByte:endByte])
                        sendLen := 9 + endByte - startByte
                        n, err = udpConnection.WriteTo(sendPacketBuffer[:sendLen], remoteUDPaddress)
                        check(err)
                    }
                }
            }
        }
    }
}
