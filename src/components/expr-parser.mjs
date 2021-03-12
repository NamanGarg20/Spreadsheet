/*
Default export is 

parse(expr, baseCellRef='')

expr is a string specifying a spreadsheet formula which could be typed
by an end-user into the cell specified by baseCellRef.  All relative
references in expr are WRT baseCellRef (if baseCellRef is not
specified, then relative references are the WRT spreadsheet origin).

If an error is detected in `expr` or `baseCellRef`, then an AppError
object is thrown with code set to 'SYNTAX'.

The value returned by parse() is a node of an Abstract Syntax Tree (AST).
An AST node is either an internal node or a leaf node.  Each
AST node is represented as JS object with a type property
identifying the type of the node:

  type === 'app':
    An internal node.  Additional properties fn which is one of '+'
    '-', '*', '/','max, or 'min'and kids which is a list of AST's.  It
    represents the application of function fn to kids.

  type === 'num':
    A leaf node representing a number. It has an additional property
    named value which is a JS number.

  type === 'ref':
    A leaf node representing a reference to a spreadsheet cell.
    It has an additional property named value which is a JS
    object having properties named row and col, each of which
    has the following properties:

      index: the index (0-based) of the row or col in the spreadsheet.

      isAbs: truthy if the index is an absolute index.
             falsy if the index is relative to the cell containing
	     the expr correponsing to the overall AST.

For example, the AST corresponding to the formula 
'((1 + c$2) * $b3)' entered into cell 'a5' is:

Ast {
  type: 'app',
  fn: '*',
  kids: [
    Ast {
      type: 'app',
      fn: '+',
      kids: [
        Ast { type: 'num', value: 1 },
        Ast {
          type: 'ref',
          value: CellRef {
            col: { isAbs: false, index: 2 },
            row: { isAbs: true, index: 1 }
          }
        }
      ],
    },
    Ast {
      type: 'ref',
      value: CellRef {
        col: { isAbs: true, index: 1 },
        row: { isAbs: false, index: -2 }
      }
    }
  ],
}

An AST has a toString(baseCellId='a1') method which produces a minimally
parenthesized representation of the AST with all relative cell references
made relative to baseCellId.  In particular, this can be used to
get a string reference for an AST having type === 'ref'.

*/



import {
  colSpecToIndex, rowSpecToIndex,
  indexToColSpec, indexToRowSpec,
} from './util.mjs';
import AppError from './app-error.mjs';


/*
expr is a spreadsheet formula specified by the following EBNF grammar:

expr
  : term ( ( '+' | '-' ) term )*
  ;
term
  : factor ( ( '*' | '/' ) factor )*
  ;
factor
  : NUMBER
  | '-' factor
  | FN '(' expr ( ',' expr )* ')'
  | cellRef
  | '(' expr ')'
  ;
cellRef
  : '$'? LETTER '$'? DIGITS+ //no intervening whitespace

The above grammar gives the structure of a language over some
vocabulary of symbols (for the spreadsheet, the vocabulary consists
numbers, cell references, function names like max and min, arithmetic
operators like + and * and punctuation symbols like , ( and ).  

The grammar specifies the phrases in the language recognized by the
grammar using rules of the form

phrase
  : alt1
  | all2
  | ...
  | altn
  ;

The top level phrase in the grammar is expr.

The alternatives alt1, alt2, ..., altN for each rule consists of a 
sequence of symbols of the following kind:

  Vocabulary Symbols:
    Enclosed within single-quotes '...' or an all upper-case identifier;
    the former stand for themselves; the latter are not defined further
    and stand for what is implied by their name.

  Phrase Symbols:
    An identifier starting with a lower-case letter.  Defined by
    a grammar rule.

  Meta Symbols:
    These are part of the grammar notation:

       * postfix operator denoting 0-or-more repetitions of the previous symbol.

       ? postfix operator denoting previous symbol is optional.

       | infix operator denoting alternatives

       ( ) used for grouping symbols

Note that quoted '(' and ')' are vocabulary symbols whereas ( ) are 
meta symbols used for grouping.

For example, the first rule above:

expr
  : term ( ( '+' | '-' ) term )*
  ;

says that an expr consists of 1-or-more term's separated by '+' or
'-'.

*/


//crude rec-desc parser
class ExprParser {

  constructor(str, baseCellId='') {
    this.baseCellId = baseCellId;
    this.toks = scan(str, new CellRef(baseCellId));
    this.nToks = this.toks.length;
    this.index = 0;
    this.tok = null;
  }

  nextTok() {
    console.assert(this.index < this.nToks,
		   `nextTok() bad index '${this.index}'`);
    this.tok = this.toks[this.index++];
  }

  match(type) {
    if (this.tok.type === type) {
      if (this.tok.type !== '<END>') this.nextTok();
    }
    else {
      const msg = `unexpected token at '${this.tok.lexeme}': expected '${type}'`;
      throw new AppError('SYNTAX', msg);
    }
  }

  parse() {
    this.nextTok();
    const e = this.expr();
    this.match('<END>');
    return e;
  }

  expr() {
    let t0 = this.term();
    while (this.tok.type === '+' || this.tok.type === '-') {
      const op = this.tok.type;
      this.nextTok();
      const t1 = this.term();
      t0 = new Ast('app', [t0, t1]);
      t0.fn = FNS[op].fn;
    }
    return t0;
  }

  term() {
    let f0 = this.factor();
    while (this.tok.type === '*' || this.tok.type === '/') {
      const op = this.tok.type;
      this.nextTok();
      const f1 = this.factor();
      f0 = new Ast('app', [f0, f1]);
      f0.fn = FNS[op].fn;
    }
    return f0;
  }

  factor() {
    let e;
    switch (this.tok.type) {
      case '(':
	this.nextTok();
	e = this.expr();
	this.match(')');
	break;
      case 'ref':
	e = new Ast('ref'); e.value = this.tok.value;
	this.nextTok();
	break;
      case '-': {
	this.nextTok();
	const operand = this.factor();
	e = new Ast('app', [operand]);
	e.fn = '-';
	break;
      }
      case 'fn': {
	const fn = this.tok.lexeme;
	this.nextTok();
	this.match('(');
	const args = [];
	args.push(this.expr());
	while (this.tok.type === ',') {
	  this.nextTok();
	  args.push(this.expr());
	}
	this.match(')');
	e = new Ast('app', args);
	e.fn = fn;
	break;
      }
      default: {
	const t = this.tok;
	this.match('num');
	e = new Ast('num'); e.value = t.value;
	break;
      }
    }
    return e;
  }

}

class Ast {
  constructor(type, kids=[]) {
    Object.assign(this, {type, kids});
  }

  toString(baseCell='a1') {
    if (typeof baseCell === 'string') baseCell = new CellRef(baseCell);
    if (this.type === 'ref') {
      return this.value.toString(baseCell);
    }
    if (this.type !== 'app') {
      return this.value.toString();
    }
    else {
      const fn = this.fn;
      const fnInfo = FNS[fn];
      if (!fnInfo.type) {
	return fn +
	  '(' + this.kids.map(k=>k.toString(baseCell)).join(', ') + ')';
      }
      else if (fnInfo.type === 'left') {
	if (this.kids.length === 1) {
	  console.assert(fn === '-', "'-' is only unary operator");
	  const paren = !!FNS[this.kids[0].fn]?.prec;
	  return fn +  Ast.left(paren) +
	    this.kids[0].toString(baseCell) + Ast.right(paren);
	}
	else {
	  console.assert(this.kids.length === 2,
			 'left assoc operator must be binary');
	  const p0 = ((FNS[this.kids[0].fn]?.prec ?? MAX_PREC) < fnInfo.prec);
	  const p1 = ((FNS[this.kids[1].fn]?.prec ?? MAX_PREC) <= fnInfo.prec);
	  return Ast.left(p0) +
	    this.kids[0].toString(baseCell) + Ast.right(p0) + fn +
	    Ast.left(p1) + this.kids[1].toString(baseCell) + Ast.right(p1);
	}
      }
      else {
	console.assert(false, `operator type ${fnInfo.type} not handled`);
      }
    }
  }

  static left(isParen) { return isParen ? '(' : ''; }
  static right(isParen) { return isParen ? ')' : ''; }
  
}

export default function parseExpr(str, baseCellId) {
  const parser = new ExprParser(str, baseCellId);
  return parser.parse();
}

function scan(str, baseCell) {
  const tokens = [];
  str = String(str);
  while ((str = str.trimStart()).length > 0) {
    let tok;
    const c = str[0];
    if (c.match(/\d/)) {
      const [ lexeme ] = str.match(/^\d+(\.\d+)?([eE][-+]?\d+)?/);
      tok = { type: 'num', lexeme, value: Number(lexeme) };
    }
    else if (c.match(/[\w\$]/)) {
      const [ lexeme ] = str.match(/^[\w\$]+/);
      const fn = FNS[lexeme];
      if (fn) {
	tok = { type: 'fn', lexeme, };
      }
      else {
	tok = { type: 'ref', lexeme, value: new CellRef(lexeme, baseCell), };
      }
    }
    else {
      tok = { type: c, lexeme: c, value: '', };
    }
    str = str.slice(tok.lexeme.length);
    tokens.push(tok);
  } //while
  tokens.push({ type: '<END>', lexeme: '<END>', value: '', });
  return tokens;
}

//for testing only
export { scan };

class CellRef {
  constructor(str='', baseCell=null) {
    str = str.trim().toLowerCase();
    if (str.length === 0) {
      this.col = { isAbs: false, index: baseCell?.col?.index ?? 0, };
      this.row = { isAbs: false, index: baseCell?.row?.index ?? 0, };
    }
    else {
      const match = str.match(/^(\$?)([a-zA-Z])(\$?)([1-9]\d*)$/);
      if (!match) {
	throw new AppError('SYNTAX', `bad cell ref ${str}`);
      }
      else {
	const [_, isAbsCol, col, isAbsRow, row ] = match;
	const colIndex =
	   colSpecToIndex(col) - (isAbsCol ? 0 : baseCell?.col?.index ?? 0);
	const rowIndex =
	   rowSpecToIndex(row) - (isAbsRow ? 0 : baseCell?.row?.index ?? 0);
	this.col = { isAbs: !!isAbsCol, index: colIndex };
	this.row =  { isAbs: !!isAbsRow, index: rowIndex };
      }
    }
  }
  
  toString(baseCell=null) {
    let str = '';
    if (this.col.isAbs) {
      str += '$' + indexToColSpec(this.col.index);
    }
    else {
      str += indexToColSpec(this.col.index, baseCell?.col?.index ?? 0);
    }
    if (this.row.isAbs) {
      str += '$' + indexToRowSpec(this.row.index);
    }
    else {
      str += indexToRowSpec(this.row.index, baseCell?.row?.index ?? 0);
    }
    return str;
  }
}

//for testing only
export { CellRef };

const MAX_PREC = 100;
const FNS = {
  '+': {
    fn: '+',
    prec: 10,
    type: 'left',
  },
  '-': {
    fn: '-',
    prec: 10,
    type: 'left',
  },
  '*': {
    fn: '*',
    prec: 20,
    type: 'left',
  },
  '/': {
    fn: '/',
    prec: 20,
    type: 'left',
  },
  max: {
    fn: 'max',
  },
  min: {
    fn: 'min',
  },
};

