"use strict";

// ===================================================================

const dirname = require("path").dirname;
const homedir = require("os").homedir;
const resolvePath = require("path").resolve;

const debug = require("debug")("app-conf");
const flatten = require("lodash/flatten");
const merge = require("lodash/merge");

const entries = require("./entries");
const pMap = require("./_pMap");
const UnknownFormatError = require("./unknown-format-error");
const unserialize = require("./serializers").unserialize;

// ===================================================================

const RELATIVE_PATH_RE = /^\.{1,2}[/\\]/;
function resolvePaths(value, base) {
  if (typeof value === "string") {
    return Promise.resolve(
      value[0] === "~" && (value[1] === "/" || value[1] === "\\")
        ? homedir() + value.slice(1)
        : RELATIVE_PATH_RE.test(value)
        ? resolvePath(base, value)
        : value
    );
  }

  if (value !== null && typeof value === "object") {
    return pMap(Object.keys(value), key =>
      resolvePaths(value[key], base).then(resolved => {
        value[key] = resolved;
      })
    ).then(() => value);
  }

  return Promise.resolve(value);
}

// ===================================================================

// Does not work properly in many cases (e.g. with pnpm)
//
// It's better for the user to pass an `appDir` option but we need to
// keep this for compatibility.
const DEFAULT_APP_DIR = dirname(dirname(__dirname));

function load(appName, opts) {
  const ignoreUnknownFormats =
    (opts != null && opts.ignoreUnknownFormats) || false;

  return pMap(entries, entry =>
    entry.read({
      appDir: (opts && opts.appDir) || DEFAULT_APP_DIR,
      appName,
    })
  )
    .then(files => {
      files = flatten(files);
      files.forEach(_ => debug(_.path));
      return pMap(files, file => {
        try {
          return resolvePaths(unserialize(file), dirname(file.path));
        } catch (error) {
          if (!(ignoreUnknownFormats && error instanceof UnknownFormatError)) {
            throw error;
          }
        }
      });
    })
    .then(data =>
      data.reduce((acc, cfg) => {
        if (cfg !== undefined) {
          merge(acc, cfg);
        }
        return acc;
      }, merge({}, opts && opts.defaults))
    );
}

// ===================================================================

exports.load = load;
