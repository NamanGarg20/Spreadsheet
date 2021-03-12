import AppError from './app-error.mjs';
import LIMITS from './limits.mjs';

function cellRefToCellId(cellRef) {
  return cellRef.toLowerCase().replace(/\$/g, '');
}

function colSpecToIndex(colSpec) {
  console.assert(0 < colSpec.length && colSpec.length <= 1,
		 'col coord can have only a single letter');
  const a = 'a'.codePointAt();
  return colSpec[0].codePointAt() - a;
}

function indexToColSpec(index, baseIndex=0) {
  console.assert(baseIndex >= 0);
  console.assert(0 < LIMITS.MAX_N_COLS,
		 `bad col index ${index}; must be under ${LIMITS.MAX_N_COLS}`);
  const absIndex = baseIndex + index;
  if (absIndex < 0 || absIndex >= LIMITS.MAX_N_COLS) {
    const msg = `bad column spec with index ${index} relative to ${baseIndex}`;
    throw new AppError('SYNTAX', msg);
  }
  const a = 'a'.codePointAt();
  return String.fromCodePoint(a + absIndex);
}

function rowSpecToIndex(rowSpec) {
  const index = Number(rowSpec) - 1;
  if (index >= LIMITS.MAX_N_ROWS) {
    const msg = `bad row spec ${rowSpec}; cannot be above ${LIMITS.MAX_N_COLS}`;
    throw new AppError('LIMITS', msg);
  }
  return index;
}


function indexToRowSpec(index, baseIndex=0) {
  console.assert(baseIndex >= 0);
  console.assert(index < LIMITS.MAX_N_ROWS,
		 `bad row index ${index}; must be under ${LIMITS.MAX_N_ROWS}`);
  const absIndex = baseIndex + index;
  if (absIndex < 0 || absIndex >= LIMITS.MAX_N_ROWS) {
    const msg = `bad row spec ${absIndex + 1} with index ${index} relative ` +
 	          `to ${baseIndex}`;
    throw new AppError('SYNTAX', msg);
  }
  return String(absIndex + 1);
}

export {
  cellRefToCellId,
  colSpecToIndex,
  indexToColSpec,
  rowSpecToIndex,
  indexToRowSpec,
};
