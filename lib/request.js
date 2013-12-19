var util = require('util')
  , InputStream = require('./streams.js').InputStream;

exports.Request = Request;

/**
 * function Request(conn, id, role, keepalive)
 * FastCGI request object. Compatible with http.IncomingMessage
 */

function Request(conn, id, role, keepalive) {
  if (!(this instanceof Request))
    return new Request(conn, id, role, keepalive);

  InputStream.call(this);

  this.id = id;
  this.role = role;
  this.keepalive = keepalive;
  this.connection = conn;
  this.timeout = 0;

  this.params = {};
  this.data = new InputStream(); // NOTE: data stream for filter requests

  this.httpVersion = null;
  this.url = '';
  this.method = null;
  this.headers = {};
  this.trailers = {}; // NOTE: Provided for http.IncomingMessage compatibility: CGI Spec does not allow trailers
  this.contentLength = 0;

  this.readable = true;
  this.complete = false;

  // NOTE: not a real socket, provided for http.IncomingMessage compatibility
  this.socket = {
    remoteAddress: null,
    remotePort: null,
    localAddress: null,
    localPort: null
  };
}
util.inherits(Request, InputStream);

Request.headerExpression = /^HTTP_/;

Request.prototype.close = function() {
  delete this.connection.requests[this.id];
  if (!this.keepalive) this.connection.socket.end();

  delete this.connection;

  this.emit('close');
};

Request.prototype._param = function(name, value) {
  this.params[name] = value;

  if (Request.headerExpression.test(name)) {
    field = name.slice(5).replace('_', '-').toLowerCase();
    if (this.headers[field] === undefined) this.headers[field] = value;
  }

  else if (name === 'CONTENT_LENGTH') {
    this.headers['content-length'] = value;
    this.contentLength = parseInt(value);
  }
  else if (name === 'CONTENT_TYPE')
    this.headers['content-type'] = value;

  else if (name === 'REMOTE_ADDR')
    this.socket.remoteAddress = value;
  else if (name === 'REMOTE_PORT')
    this.socket.remotePort = parseInt(value);
  else if (name === 'SERVER_ADDR')
    this.socket.localAddress = value;
  else if (name === 'SERVER_PORT')
    this.socket.localPort = parseInt(value);

  else if (name === 'SERVER_PROTOCOL') {
    this.httpVersion = value.slice(5);
    numbers = this.httpVersion.split('.');
    this.httpVersionMajor = parseInt(numbers[0]);
    this.httpVersionMinor = parseInt(numbers[1]);
  }

  else if (name === 'REQUEST_METHOD')
    this.method = value;
  else if (name === 'REQUEST_URI')
    this.url = value;
};

Request.prototype.setTimeout = function(msecs, callback) {
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

Request.prototype._resetTimeout = function() {
  if (this.timeout || this._timeout_ref) {
    if (this._timeout_ref) clearTimeout(this._timeout_ref);
    if (this.timeout > 0) {
      this._timeout_ref = setTimeout(function(self) {
        self.emit('timeout');
      }, this.timeout, this);
    } else this._timeout_ref = undefined;
  }
};

Request.prototype._read = function(size) {
  while (this._input.length && this.push(this._input.shift()));
};