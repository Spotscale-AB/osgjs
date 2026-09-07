import { assert } from 'chai';
import KTX2Reader from 'osgDB/KTX2Reader';
import ktx2Worker from 'osgDB/ktx2/ktx2Worker';
import { decodeTranscoderWasm } from 'osgDB/ktx2/mscBasisTranscoder';
import { ETC1S_KTX2_BASE64, UASTC_KTX2_BASE64, toArrayBuffer } from 'tests/osgDB/KTX2Reader';

//
// Drives the real source of the transcode worker with a stand in for self.
//
// A genuine Worker needs a browser, so instead the source string that would go into the Blob is
// evaluated here and its message loop is talked to directly. That still covers the parts most
// likely to break: that the stringified createKtx2Core and workerMain survive the bundler, that
// the three pieces of source fit together, and that the message protocol round trips.
//
// 'process' and 'require' are shadowed the same way the main thread loader shadows them, so
// that the emscripten glue takes its web branch as it would in a real worker.
//
var startFakeWorker = function() {
    var fakeWorker = {
        onmessage: undefined,
        messages: [],
        // Resolves with the next message the worker posts
        next: function() {
            var self = this;
            return new Promise(function(resolve) {
                self._waiting = resolve;
                self._flush();
            });
        },
        _flush: function() {
            if (this._waiting !== undefined && this.messages.length > 0) {
                var resolve = this._waiting;
                this._waiting = undefined;
                resolve(this.messages.shift());
            }
        },
        postMessage: function(message) {
            this.messages.push(message);
            this._flush();
        },
        send: function(message) {
            this.onmessage({ data: message });
        },
        location: { href: 'blob:fake' }
    };

    /*jshint evil: true */
    new Function('self', 'process', 'require', KTX2Reader.getWorkerSource())(
        fakeWorker,
        undefined,
        undefined
    );
    /*jshint evil: false */

    assert.isFunction(fakeWorker.onmessage, 'the worker source must install a message handler');
    return fakeWorker;
};

export default function() {
    test('ktx2Worker.getWorkerSource carries the transcoder, the core and the message loop', function() {
        var source = KTX2Reader.getWorkerSource();
        assert.isAbove(source.length, 60000, 'the emscripten glue should be in there');
        assert.include(source, 'self.createKtx2Core = function', 'the core should be stringified');
        assert.include(source, 'self.onmessage', 'the message loop should be stringified');
        assert.include(source, 'MSC_TRANSCODER', 'the transcoder factory should be in there');
        // The wasm is sent in the init message instead of being baked into the source
        assert.notInclude(source, 'MSC_BASIS_TRANSCODER_WASM_BASE64');
        // The bundler rewrites references to an import binding, and such a rewrite inside a
        // stringified function would leave the worker with an identifier it cannot resolve
        assert.notInclude(source, '__WEBPACK', 'no bundler rewrite may leak into the source');
    });

    test('the worker source reports itself ready once the transcoder is up', function() {
        var fakeWorker = startFakeWorker();
        fakeWorker.send({ type: 'init', id: 0, wasmBinary: decodeTranscoderWasm() });
        return fakeWorker.next().then(function(message) {
            assert.equal(message.type, 'ready', JSON.stringify(message));
            assert.equal(message.id, 0);
        });
    });

    [
        { name: 'ETC1S', base64: ETC1S_KTX2_BASE64 },
        { name: 'UASTC', base64: UASTC_KTX2_BASE64 }
    ].forEach(function(source) {
        test('the worker source transcodes ' + source.name + ' to the first candidate', function() {
            var fakeWorker = startFakeWorker();
            fakeWorker.send({ type: 'init', id: 0, wasmBinary: decodeTranscoderWasm() });

            return fakeWorker
                .next()
                .then(function(ready) {
                    assert.equal(ready.type, 'ready', JSON.stringify(ready));
                    fakeWorker.send({
                        type: 'transcode',
                        id: 7,
                        buffer: toArrayBuffer(source.base64),
                        candidates: [{ name: 'BC3_RGBA', nameOpaque: 'BC1_RGB' }]
                    });
                    return fakeWorker.next();
                })
                .then(function(message) {
                    assert.equal(message.type, 'result', JSON.stringify(message));
                    assert.equal(message.id, 7, 'the reply must carry the request id');
                    assert.equal(message.width, 16);
                    assert.equal(message.height, 16);
                    // The fixtures have alpha, so the opaque variant must not be picked
                    assert.equal(message.targetName, 'BC3_RGBA');
                    assert.equal(message.levels.length, 5, '16x16 down to 1x1');

                    for (var level = 0; level < message.levels.length; level++) {
                        var size = Math.max(1, 16 >> level);
                        var blocks = Math.ceil(size / 4) * Math.ceil(size / 4);
                        assert.equal(message.levels[level].width, size);
                        assert.equal(message.levels[level].height, size);
                        assert.instanceOf(message.levels[level].buffer, ArrayBuffer);
                        assert.equal(
                            message.levels[level].buffer.byteLength,
                            blocks * 16,
                            'level ' + level + ' block count'
                        );
                    }
                });
        });
    });

    test('the worker source falls back on RGBA32 when no candidate fits', function() {
        var fakeWorker = startFakeWorker();
        fakeWorker.send({ type: 'init', id: 0, wasmBinary: decodeTranscoderWasm() });

        return fakeWorker
            .next()
            .then(function() {
                fakeWorker.send({
                    type: 'transcode',
                    id: 1,
                    buffer: toArrayBuffer(ETC1S_KTX2_BASE64),
                    candidates: []
                });
                return fakeWorker.next();
            })
            .then(function(message) {
                assert.equal(message.type, 'result', JSON.stringify(message));
                assert.equal(message.targetName, 'RGBA32');
                assert.equal(message.levels[0].buffer.byteLength, 16 * 16 * 4);
            });
    });

    test('the worker source reports a bad buffer instead of dying', function() {
        var fakeWorker = startFakeWorker();
        fakeWorker.send({ type: 'init', id: 0, wasmBinary: decodeTranscoderWasm() });

        return fakeWorker
            .next()
            .then(function() {
                fakeWorker.send({
                    type: 'transcode',
                    id: 3,
                    buffer: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer,
                    candidates: []
                });
                return fakeWorker.next();
            })
            .then(function(message) {
                assert.equal(message.type, 'error', JSON.stringify(message));
                assert.equal(message.id, 3);
                assert.match(message.message, /not a KTX2 file/);
            });
    });

    test('ktx2Worker reports whether this environment can run the workers', function() {
        // node and jsdom have no Worker, so the pool must say so and KTX2Reader must have
        // fallen back on the main thread for every other test in this suite
        assert.isFalse(ktx2Worker.isWorkerSupported());
        assert.isFalse(ktx2Worker.instance().isAvailable());
        assert.isAbove(ktx2Worker.instance().getWorkerCount(), 0, 'a default count is still set');
    });
}
