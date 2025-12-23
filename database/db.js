const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'social_media.db');

let db = null;
let SQL = null;
let initialized = false;

// Initialize the database
async function initDb() {
  if (initialized) return;
  
  SQL = await initSqlJs();
  
  // Load existing database or create new
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');
  initialized = true;
}

// Save database to file
function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Statement wrapper class
class StatementWrapper {
  constructor(sql) {
    this.sql = sql;
  }

  _convertParams(params) {
    if (params.length === 0) return [];
    if (params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])) {
      // Named parameters - convert to positional
      const obj = params[0];
      const namedParams = this.sql.match(/[@:$]\w+/g) || [];
      return namedParams.map(param => {
        const key = param.substring(1);
        return obj[key];
      });
    }
    return params;
  }

  run(...params) {
    const convertedParams = this._convertParams(params);
    db.run(this.sql, convertedParams);
    saveDb();
    const lastId = db.exec('SELECT last_insert_rowid() as id');
    return { 
      changes: db.getRowsModified(), 
      lastInsertRowid: lastId[0]?.values[0]?.[0] || 0 
    };
  }

  get(...params) {
    const convertedParams = this._convertParams(params);
    try {
      const stmt = db.prepare(this.sql);
      if (convertedParams.length > 0) {
        stmt.bind(convertedParams);
      }
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    } catch (e) {
      console.error('Error in get:', e.message, this.sql);
      return undefined;
    }
  }

  all(...params) {
    const convertedParams = this._convertParams(params);
    const results = [];
    try {
      const stmt = db.prepare(this.sql);
      if (convertedParams.length > 0) {
        stmt.bind(convertedParams);
      }
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
    } catch (e) {
      console.error('Error in all:', e.message, this.sql);
    }
    return results;
  }
}

// Database wrapper
const dbWrapper = {
  prepare(sql) {
    return new StatementWrapper(sql);
  },
  
  exec(sql) {
    db.run(sql);
    saveDb();
  },
  
  run(sql, params = []) {
    db.run(sql, params);
    saveDb();
    const lastId = db.exec('SELECT last_insert_rowid() as id');
    return { 
      changes: db.getRowsModified(), 
      lastInsertRowid: lastId[0]?.values[0]?.[0] || 0 
    };
  },
  
  pragma(statement) {
    db.run(`PRAGMA ${statement}`);
  },
  
  transaction(fn) {
    return (...args) => {
      db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        db.run('COMMIT');
        saveDb();
        return result;
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
    };
  }
};

// Initialize on module load
const readyPromise = initDb();

module.exports = dbWrapper;
module.exports.ensureReady = () => readyPromise;
module.exports.saveDb = saveDb;
module.exports.initDb = initDb;
