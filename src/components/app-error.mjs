// -*- mode: JavaScript; -*-

export default class AppError extends Error {
  constructor(code,   /** documented error code */
	      msg)    /** undocumented descriptive error message */ 
  {
    super(msg);
    this.code = code;
  }

  toString() { return `${this.code}: ${this.message}`; }
}
