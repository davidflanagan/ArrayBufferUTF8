// Add UTF-8 methods to ArrayBuffer, modeling them on Node's
// Buffer.write() and Buffer.toString().  I'm not conviced that these
// are ideal.  In particular, I probably need a way of encoding the
// string length in bytes or chars, or a way of marking the end of
// a string.  (With 0xFF, perhaps since that should never appear in UTF8?)

ArrayBuffer.prototype.writeUTF8 = function(s, start) {
    function fail(msg) { throw new Error(msg); }

    if (arguments.length < 2) start = 0;
    var bytes = new Uint8Array(this, start);
    var i=0;  // character index in the string s;
    var b=0;  // byte index in bytes array
    
    for(i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        
        if (c <= 0x7F) {       // One byte of UTF-8
            if (b >= bytes.length) fail("ArrayBuffer overflow");
            bytes[b++] = c;
        }
        else if (c <= 0x7FF) { // Two bytes of UTF-8
            if (b+1 >= bytes.length) fail("ArrayBuffer overflow");
            bytes[b++] = 0xC0 | ((c & 0x7C0)>>>6);
            bytes[b++] = 0x80 | (c & 0x3F);
        }
        else if (c <= 0xD7FF || (c >= 0xE000 && c <= 0xFFFF)) {
            // Three bytes of UTF-8.  Source character is not
            // a UTF-16 surrogate
            if (b+2 >= bytes.length) fail("ArrayBuffer overflow");
            bytes[b++] = 0xE0 | ((c & 0xF000) >>> 12);
            bytes[b++] = 0x80 | ((c & 0x0FC0) >>> 6);
            bytes[b++] = 0x80 | (c & 0x3f);
        }
        else {
            if (b+3 >= bytes.length) fail("ArrayBuffer overflow");
            if (i == s.length-1) fail("Unpaired surrogate");
            var d = s.charCodeAt(++i);
            if (c < 0xD800 || c > 0xDBFF || d < 0xDC00 || d > 0xDFFF) {
                console.log(i-2, c.toString(16), d.toString(16))
                fail("Unpaired surrogate");
            }
            
            var cp = ((c & 0x03FF) << 10) + (d & 0x03FF) + 0x10000;

            bytes[b++] = 0xF0 | ((cp & 0x1C0000) >>> 18);
            bytes[b++] = 0x80 | ((cp & 0x03F000) >>> 12);
            bytes[b++] = 0x80 | ((cp & 0x000FC0) >>> 6);
            bytes[b++] = 0x80 | (cp & 0x3f);
        }
    }
    return b;  // Return # of bytes written
};

ArrayBuffer.prototype.toString = function(start, end) {
    function fail() { throw new Error("Illegal UTF-8"); }

    if (arguments.length == 0) start = 0;
    if (arguments.length < 2) end = this.byteLength;

    var bytes = new Uint8Array(this, start, end-start);
    // At most we'll have one character per byte
    var charcodes = [];

    // the fromCharCode hack didn't work in chrome
    //    var charcodes = new Uint32Array(bytes.length);

    var b=0, c=0;  // Indexes into bytes[] and charcodes[]
    var b1, b2, b3, b4;  // Up to 4 bytes

    // See http://en.wikipedia.org/wiki/UTF-8
    while(b < bytes.length) {
        var b1 = bytes[b];
        if (b1 < 128) {
            charcodes[c++] = b1;
            b += 1;
        }
        else if (b1 < 194) {
            // unexpected continuation character...
            fail();
        }
        else if (b1 < 224) {
            // 2-byte sequence
            if (b+1 >= bytes.length) fail();
            b2 = bytes[b+1];
            if (b2 < 128 || b2 > 191) fail();
            charcodes[c++] = ((b1 & 0x1f) << 6) + (b2 & 0x3f);
            b+=2;
        }
        else if (b1 < 240) {
            // 3-byte sequence
            if (b+2 >= bytes.length) fail();
            b2 = bytes[b+1];
            if (b2 < 128 || b2 > 191) fail();
            b3 = bytes[b+2];
            if (b3 < 128 || b3 > 191) fail();
            charcodes[c++] = ((b1 & 0x0f) << 12) +
                ((b2 & 0x3f) << 6) + (b3 & 0x3f);
            b+=3;
        }
        else if (b1 < 245) {
            // 4-byte sequence
            if (b+3 >= bytes.length) fail();
            b2 = bytes[b+1];
            if (b2 < 128 || b2 > 191) fail();
            b3 = bytes[b+2];
            if (b3 < 128 || b3 > 191) fail();
            b4 = bytes[b+3];
            if (b4 < 128 || b4 > 191) fail();
            var cp = ((b1 & 0x07) << 18) + ((b2 & 0x3f) << 12) +
                ((b3 & 0x3f) << 6) + (b4 & 0x3f);
            cp -= 0x10000;

            // Now turn this code point into two surrogate pairs
            charcodes[c++] = 0xd800 + ((cp & 0x0FFC00)>>>10);
            charcodes[c++] = 0xdc00 + (cp & 0x0003FF);

            b+=4;
        }
        else {
            // Illegal byte
            fail();
        }
    }
    if (charcodes.length < 65536) 
        return String.fromCharCode.apply(String, charcodes);
    else {
        var chunks = [];
        var start = 0, end = 65536;
        while(start < charcodes.length) {
            var slice = charcodes.slice(start, end);
            chunks.push(String.fromCharCode.apply(String, slice));
            start = end;
            end = end + 65536;
            if (end > charcodes.length) end = charcodes.length;
        }
        return chunks.join("");
    }
};
