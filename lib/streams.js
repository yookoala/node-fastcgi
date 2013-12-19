var stream = require('stream')
  , util = require('util')
  , fcgi = require('fastcgi-stream');

exports.InputStream = InputStream;
exports.OutputStream = OutputStream;

/**
 * function InputStream(buffer)
 * Readable stream interface for buffer arrays
 */

function InputStream(buffer) {
  if (!(this instanceof InputStream))
    return new InputStream(array);

  stream.Readable.call(this);

  this.buffer = buffer || [];
}
util.inherits(InputStream, stream.Readable);

InputStream.prototype._read = function(size) {
  while (this.array.length && this.push(this.array.shift()));
};

/**
 * function OutputStream(conn, req, res, type)
 * Writable stream interface for FastCGI output streams
 */

function OutputStream(conn, req, res, type) {
  if (!(this instanceof OutputStream))
    return new OutputStream(conn, req, res, type);

  stream.Writable.call(this);

  this.conn = conn;
  this.req = req;
  this.res = this._httpMessage = res; // NOTE: http.OutgoingMessage needs connection._httpMessage = response
  this.type = type || fcgi.records.StdOut;

  this.timeout = 0;

  // NOTE: http.OutgoingMessage needs connection.writable = true
  this._open = this.writable = true;
}
util.inherits(OutputStream, stream.Writable);

OutputStream.prototype.close = function() {
  this._open = this.writable = false;
  this.emit('close');
};

OutputStream.prototype.setTimeout = function(msecs, callback) {
  if (this._timeout_ref) {
    clearTimeout(this._timeout_ref);
  }

  this.timeout = msecs;
  if (callback) this.on('timeout', callback);

  if (msecs > 0) this._timeout_ref = setTimeout(function(self) {
    self.emit('timeout');
  }, msecs, this);
  else this._timeout_ref = undefined;
};

OutputStream.prototype._resetTimeout = function() {
  if (this.timeout || this._timeout_ref) {
    if (this._timeout_ref) clearTimeout(this._timeout_ref);
    if (this.timeout > 0) {
      this._timeout_ref = setTimeout(function(self) {
        self.emit('timeout');
      }, this.timeout, this);
    } else this._timeout_ref = undefined;
  }
};

OutputStream.prototype._write = function(chunk, encoding, callback) {
  if (!this._open) {
    callback(new Error("Output stream is not open"));
    return;
  }

  var self = this;

  this._resetTimeout();

  return this.conn.stream.writeRecord(
    this.req.id,
    new this.type(chunk),
    function() {
      return callback.apply(this, arguments);
    }
  );
};