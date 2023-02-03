const { logging, flagging } = require("./logging.controller");
const {
  jaroWinklerDistance,
  levenshteinDistance,
} = require("./stringSimilarity");

/* --- Levelquatting or Combosquatting - detect direct usage of trademark --- */
exports.checkLevelsquattingCombosquatting = (trademarks, parsedHostname) => {
  // remove any "-" or "." to account for cases like dh-s.bank, or db.s.bank
  parsedHostname = parsedHostname.replace(/\-/g, "").replace(/\./g, "");

  var flags = "";
  for (let i = 0; i < trademarks.length; i++) {
    if (parsedHostname.includes(trademarks[i].keyword)) {
      flags += ` ${trademarks[i].keyword}`;
    }
  }

  if (flags != "") {
    return [true, flags];
  }

  return [false, null];
};

/* --- Typosquatting or Bitsquatting - detect indirect usage of trademark --- */
exports.checkTyposquattingBitsquatting = (keywords, checkStrings) => {
  keywords = keywords.map((record) => record.keyword);

  var flags = "";
  var logs = "";

  for (let i = 0; i < checkStrings.length; i++) {
    for (let j = 0; j < keywords.length; j++) {
      var jaroWinklerSimilarity = jaroWinklerDistance(
        checkStrings[i],
        keywords[j]
      );

      logs != "" ? logs += "\n" : null;
      logs += `checkTyposquattingBitsquatting= ~jaroWinklerSimilarity | Comparing ${checkStrings[i]} with ${keywords[j]}: ${jaroWinklerSimilarity}`

      if (parseFloat(jaroWinklerSimilarity) >= 0.75) {
        if (flags.length != 0) flags += "\n";
        flags += `- Typosquatting/Bitsquatting Detected with Jaro-Winkler Algorithm\n\t- Similarity of {${checkStrings[i]}} with trademark {${keywords[j]}} is ${jaroWinklerSimilarity}`;
      }

      if (jaroWinklerSimilarity > 0.6) {
        var levenshteinDistSimilarity = levenshteinDistance(
          checkStrings[i],
          keywords[j]
        );

        logs += `\ncheckTyposquattingBitsquatting= ~levenshteinDistSimilarity | Comparing ${checkStrings[i]} with ${keywords[j]}: ${levenshteinDistSimilarity}`

        if (levenshteinDistSimilarity / checkStrings[i].length <= 1 / 3) {
          if (flags.length != 0) flags += "\n";
          flags += `- Typosquatting/Bitsquatting Detected with Levenshtein Distance\n\t- Distance of {${checkStrings[i]}} with trademark {${keywords[j]}} is ${levenshteinDistSimilarity}`;
        }
      }
    }
  }

  if (flags.length != 0) {
    return [true, logs, flags];
  }

  return [false, logs, null];
};