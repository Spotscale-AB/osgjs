import { assert } from 'chai';
import Texture from 'osg/Texture';
import WebglCaps from 'osg/WebGLCaps';
import KTX2Reader from 'osgDB/KTX2Reader';

// 16x16 RGBA, four solid quadrants: red top left, green top right, blue bottom left and half
// transparent white bottom right, with a full mipmap chain. Produced with
//   ktx create --format R8G8B8A8_UNORM --assign-tf linear --generate-mipmap
//              --encode basis-lz --qlevel 255 quadrants.png etc1s.ktx2
export var ETC1S_KTX2_BASE64 =
    'q0tUWCAyMLsNChoKAAAAAAEAAAAQAAAAEAAAAAAAAAAAAAAAAQAAAAUAAAABAAAAyAAAADwAAAAEAQAAVAAAAFgB' +
    'AAAAAAAAKQEAAAAAAACUAgAAAAAAABEAAAAAAAAAAAAAAAAAAACLAgAAAAAAAAkAAAAAAAAAAAAAAAAAAACHAgAA' +
    'AAAAAAQAAAAAAAAAAAAAAAAAAACDAgAAAAAAAAQAAAAAAAAAAAAAAAAAAACBAgAAAAAAAAIAAAAAAAAAAAAAAAAA' +
    'AAA8AAAAAAAAAAIAOACjAQEAAwMAAAgIAAAAAAAAAAA/AAAAAAAAAAAA/////0AAPw8AAAAAAAAAAP////8sAAAA' +
    'S1RYd3JpdGVyAGt0eCBjcmVhdGUgdjQuNC4yIC8gbGlia3R4IHY0LjQuMgAfAAAAS1RYd3JpdGVyU2NQYXJhbXMA' +
    'LS1xbGV2ZWwgMjU1AAAPAAwARgAAADEAAAA6AAAAAAAAAAAAAAAAAAAACgAAAAoAAAAHAAAAAAAAAAAAAAAFAAAA' +
    'BQAAAAQAAAAAAAAAAAAAAAIAAAACAAAAAgAAAAAAAAAAAAAAAgAAAAIAAAACAAAAAAAAAAAAAAABAAAAAQAAAAEA' +
    'AAAgQMSAAQAAQIj+aIAAUQMEAAAAYVgEseyDgQBxAwQAAIRhifhChU4iABMABAAABAGQR5P/n2u7dkCTJMmpAyhI' +
    'id+sYLwLrKqqr6+qqqqi6OujqEpNTUVBQUEBUFUFUFVVVX19VVBYFRAQGBYUHF4XFFxfBwBYBwDBhIABAABhGIYF' +
    'Mv+qLqgPQAQAAQCAYJgjL7Im4JEDAQBDwJGyaRgHR0+QnzgAZgAAAAAAABAFCAAGCtQBcgOaAWIBjvR01AAz5vgL' +
    'LWWEm0qJwGcOBxl54aZSPwA=';

// The same image, with --encode uastc instead of --encode basis-lz

export var UASTC_KTX2_BASE64 =
    'q0tUWCAyMLsNChoKAAAAAAEAAAAQAAAAEAAAAAAAAAAAAAAAAQAAAAUAAAAAAAAAyAAAACwAAAD0AAAAMAAAAAAA' +
    'AAAAAAAAAAAAAAAAAACgAQAAAAAAAAABAAAAAAAAAAEAAAAAAABgAQAAAAAAAEAAAAAAAAAAQAAAAAAAAABQAQAA' +
    'AAAAABAAAAAAAAAAEAAAAAAAAABAAQAAAAAAABAAAAAAAAAAEAAAAAAAAAAwAQAAAAAAABAAAAAAAAAAEAAAAAAA' +
    'AAAsAAAAAAAAAAIAKACmAQEAAwMAABAAAAAAAAAAAAB/AwAAAAAAAAAA/////ywAAABLVFh3cml0ZXIAa3R4IGNy' +
    'ZWF0ZSB2NC40LjIgLyBsaWJrdHggdjQuNC4yAAAAAAAAAAAAAAAAABcQEPAbQAgBAAAAAAAAAABPKA8jaJmHXZdm' +
    'ht+B//9/T+IBBDwiwv/D3cMfAYD/fxOBk4EMgSIBgAQAgP9/AAAPgQyRY9xB3kH+Qd4vAIAqDwELoUFA/t9jQNzf' +
    'Q6GgIDCBaEFOTEy82032b/Zv1E33HwDgH3oAAAAAAAAAAAAA9x8A4B96AAAAAAAAAAAAABfgH+AfAg8AAAAAAAAA' +
    'AAAX4B/gHwIPAAAAAAAAAAAA9x8A4B96AAAAAAAAAAAAAPcfAOAfegAAAAAAAAAAAAAX4B/gHwIPAAAAAAAAAAAA' +
    'F+Af4B8CDwAAAAAAAAAAABcA4P8fAuABAAAAAAAAAAAXAOD/HwLgAQAAAAAAAAAA9///HxB87wEAAAAAAAAAAPf/' +
    '/x8QfO8BAAAAAAAAAAAXAOD/HwLgAQAAAAAAAAAAFwDg/x8C4AEAAAAAAAAAAPf//x8QfO8BAAAAAAAAAAD3//8f' +
    'EHzvAQAAAAAAAAAA';

export var toArrayBuffer = function(base64) {
    var binary = window.atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
};

// Forces the set of compressed texture extensions the reader gets to see
var setSupportedExtension = function(name) {
    var extensions = WebglCaps.instance().getWebGLExtensions();
    for (var key in extensions) delete extensions[key];
    if (name !== undefined) extensions[name] = {};
};

var pixel = function(data, width, x, y) {
    var offset = (y * width + x) * 4;
    return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
};

var assertNear = function(actual, expected, message) {
    for (var i = 0; i < expected.length; i++) {
        assert.isAtMost(
            Math.abs(actual[i] - expected[i]),
            8,
            message + ': got ' + actual + ', expected about ' + expected
        );
    }
};

export default function() {
    var sources = [
        { name: 'ETC1S', base64: ETC1S_KTX2_BASE64 },
        { name: 'UASTC', base64: UASTC_KTX2_BASE64 }
    ];

    // Each entry is the format and block size the reader should end up with when the context
    // supports exactly the listed extension. The fixtures have an alpha channel, so the
    // formats picked are the ones carrying alpha.
    var targets = [
        {
            extension: 'EXT_texture_compression_bptc',
            format: Texture.COMPRESSED_RGBA_BPTC_UNORM_EXT,
            blockByteLength: 16
        },
        {
            extension: 'WEBGL_compressed_texture_astc',
            format: Texture.COMPRESSED_RGBA_ASTC_4x4_KHR,
            blockByteLength: 16
        },
        {
            extension: 'WEBGL_compressed_texture_s3tc',
            format: Texture.COMPRESSED_RGBA_S3TC_DXT5_EXT,
            blockByteLength: 16
        },
        {
            extension: 'WEBGL_compressed_texture_etc',
            format: Texture.COMPRESSED_RGBA8_ETC2_EAC,
            blockByteLength: 16
        }
    ];

    sources.forEach(function(source) {
        test(
            'KTX2Reader.read ' + source.name + ' without any compressed texture extension',
            function() {
                setSupportedExtension(undefined);
                return KTX2Reader.read(toArrayBuffer(source.base64), source.name + '.ktx2').then(
                    function(data) {
                        assert.equal(data.width, 16);
                        assert.equal(data.height, 16);
                        assert.equal(data.format, Texture.RGBA, 'falls back on RGBA32');
                        assert.equal(data.transcodedTo, 'RGBA32');
                        assert.equal(data.mipmapCount, 5, '16x16 down to 1x1');

                        // the four quadrants of the source image must come back, in that order,
                        // which also pins down the row order and the level order
                        var level0 = data.mipmaps[0].getImage();
                        assert.equal(level0.length, 16 * 16 * 4);
                        assertNear(pixel(level0, 16, 4, 4), [255, 0, 0, 255], 'top left');
                        assertNear(pixel(level0, 16, 12, 4), [0, 255, 0, 255], 'top right');
                        assertNear(pixel(level0, 16, 4, 12), [0, 0, 255, 255], 'bottom left');
                        assertNear(pixel(level0, 16, 12, 12), [255, 255, 255, 128], 'bottom right');

                        for (var level = 0; level < data.mipmapCount; level++) {
                            var size = Math.max(1, 16 >> level);
                            assert.equal(data.mipmaps[level].getWidth(), size);
                            assert.equal(data.mipmaps[level].getHeight(), size);
                            assert.equal(data.mipmaps[level].getImage().length, size * size * 4);
                        }
                    }
                );
            }
        );

        targets.forEach(function(target) {
            test('KTX2Reader.read ' + source.name + ' with ' + target.extension, function() {
                setSupportedExtension(target.extension);
                return KTX2Reader.read(toArrayBuffer(source.base64), source.name + '.ktx2').then(
                    function(data) {
                        assert.equal(data.format, target.format);
                        assert.equal(data.mipmapCount, 5);
                        assert.isOk(
                            new Texture().checkIsCompressed(data.format),
                            'the format must be known to be compressed'
                        );
                        for (var level = 0; level < data.mipmapCount; level++) {
                            var size = Math.max(1, 16 >> level);
                            var blocks = Math.ceil(size / 4) * Math.ceil(size / 4);
                            assert.equal(
                                data.mipmaps[level].getImage().length,
                                blocks * target.blockByteLength,
                                'level ' + level + ' block count'
                            );
                        }
                    }
                );
            });
        });
    });

    test('KTX2Reader.readImage builds an osg.Image usable by Texture', function() {
        setSupportedExtension('WEBGL_compressed_texture_s3tc');
        return KTX2Reader.readImage(toArrayBuffer(ETC1S_KTX2_BASE64), 'quadrants.ktx2').then(
            function(image) {
                assert.equal(image.getURL(), 'quadrants.ktx2');
                assert.equal(image.getWidth(), 16);
                assert.equal(image.getHeight(), 16);
                assert.equal(image.getFormat(), Texture.COMPRESSED_RGBA_S3TC_DXT5_EXT);
                assert.isOk(image.hasMipmap());
                assert.isOk(image.isReady());

                var texture = new Texture();
                texture.setImage(image);
                assert.isOk(texture._isCompressed, 'the texture must upload as compressed');
                assert.equal(texture.getInternalFormat(), Texture.COMPRESSED_RGBA_S3TC_DXT5_EXT);
            }
        );
    });

    test('KTX2Reader.read rejects a buffer that is not KTX2', function() {
        var notKtx2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer;
        return KTX2Reader.read(notKtx2, 'bogus.ktx2').then(
            function() {
                assert.isOk(false, 'should have been rejected');
            },
            function(error) {
                assert.match(error.message, /not a KTX2 file/);
            }
        );
    });
}
