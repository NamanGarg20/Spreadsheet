import AppError from './app-error.mjs';

import mongo from 'mongodb';


//use in mongo.connect() to avoid warning
const MONGO_CONNECT_OPTIONS = { useUnifiedTopology: true };



/**
 * Storage service for spreadsheets. 
 *
 * Errors must be reported by throwing a suitable
 * AppError object having a suitable message property
 * and code property set as follows:
 *
 *  `DB`: database error.
 *
 *  Will report DB errors but will not make any attempt to report
 *  spreadsheet errors like bad formula syntax or circular references
 *  (it is assumed that a higher layer takes care of checking for this
 *  and the inputs to this service have already been validated).
 */

/** DB store for multiple spreadsheets */
export default class DBSSStore {

  //factory method
  /** Return a new store for multiple spreadsheets at dbUrl */
  static async make(dbUrl) {
    let client, db;
    try {
      client = await mongo.connect(dbUrl, MONGO_CONNECT_OPTIONS);
      db = client.db();
    }
    catch (err) {
      const msg = `cannot connect to URL "${dbUrl}": ${err}`;
      throw new AppError('DB', msg);
    }
    return new DBSSStore(client, db);
  }

  constructor(client, db) {
    Object.assign(this, {client, db});
  }

  /** Release all resources held by this store.
   *  Specifically, close any database connections.
   */
  async close() {
    await this.client.close();
  }

  /** Update cellId for spreadsheet ssName to contain formula */
  async updateCell(ssName, cellId, formula) {
    try {
      const data = this.db.collection(ssName);
      await data.updateOne({_id: cellId}, {$set: { formula }},
			   { upsert: true });
    }
    catch (err) {
      const msg = `cannot update "${cellId}: ${err}`;
      throw new AppError('DB', msg);
    }
  }

  /** Clear contents of spreadsheet ssName */
  async clear(ssName) {
    try {
      const collections = await this.client.db().listCollections().toArray();
      if (collections.find(c => c.name === ssName)) {
	const data = this.db.collection(ssName);
	await data.drop();
      }
    }
    catch (err) {
      const msg = `cannot drop collection ${ssName}: ${err}`;
      throw new AppError('DB', msg);
    }
  }

  /** Delete all info for cellId from spreadsheet ssName. */
  async delete(ssName, cellId) {
    try {
      const data = this.db.collection(ssName);
      await data.deleteOne({_id: cellId});
    }
    catch (err) {
      this.spreadsheet.undo();
      const msg = `cannot delete ${cellId} from spreadsheet ${ssName}: ${err}`;
      throw new AppError('DB', msg);
    }
  }

  /** Return list of pairs of cellId, formula for spreadsheet ssName */
  async readFormulas(ssName) {
    const formulas = [];
    try {
      const data = this.db.collection(ssName);
      const cursor = await data.find({}); 
      const cells = await cursor.toArray();
      for (const {_id: cellId, formula } of cells) {
	formulas.push([cellId, formula]);
      }
    }
    catch (err) {
      const msg = `cannot read formulas from spreadsheet ${ssName}: ${err}`;
      throw new AppError('DB', msg);
    }
    return formulas;
  }

} //class DBSSStore
