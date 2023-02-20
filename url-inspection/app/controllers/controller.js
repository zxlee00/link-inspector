const { Worker } = require("worker_threads");
const fs = require("fs");
const moment = require("moment-timezone");
const AWS = require("aws-sdk");
const db = require("../models");
const { checkIsUrl } = require("./inspection.controller");
const InspectLinks = db.inspected_links;
const { ObjectId } = require("mongodb");

// var credentials = new AWS.SharedIniFileCredentials({ profile: "default" });
// AWS.config.credentials = credentials;
const s3 = new AWS.S3();

exports.inspectLink = (req, res) => {
  /* -------------------------------------------------------------------------- */
  /*                              Validate Request                              */
  /* -------------------------------------------------------------------------- */
  if (!req.body.inspectURL) {
    res.status(400).send({
      message: "Link to be inspected must be provided.",
    });

    return;
  } else if (!checkIsUrl(req.body.inspectURL)) {
    res.status(400).send({
      message: "Invalid URL",
    });

    return;
  }

  var url = req.body.inspectURL;

  /* --------------------- Creating an InspectLinks object --------------------- */
  var inspectedLink = {
    processed_url: "",
    original_url: url,
    status: "processing", // status as "processing" to indicate that the processing is still ongoing
    report: "",
    image: "",
    domain_age: null,
    registrar_abuse_contact: "",
    toFlag: null,
    registration_period: null,
    dga_detected: false,
  };

  /* -------------------------------------------------------------------------- */
  /*                             Create new log file                            */
  /* -------------------------------------------------------------------------- */
  const fileName = moment().tz("Asia/Singapore").format("YYYY-MM-DD[_]HH-mm-ss-SSS") + ".txt";
  fs.closeSync(fs.openSync(fileName, "w"));
  var logger = fs.createWriteStream(fileName, {
    flags: "a", // 'a' means appending (old data will be preserved)
  });

  var reportStr = "";
  reportStr += "\n---------------- Inspection Logs ----------------";
  reportStr += `\n${logTime()} exports.inspectLink= ~ | Starting inspection on ${url}`;

  /* -------------------------------------------------------------------------- */
  /*                  Create new Worker Thread to inspect link                  */
  /* -------------------------------------------------------------------------- */
  const worker = new Worker("./app/controllers/inspectionWorker.js", {
    workerData: { url: url, inspectedLink: inspectedLink },
  });

  worker.on("message", (message) => {
    if (message[0] == "log") {
      // receive message on parent port, write message to log file
      reportStr += `\n${logTime()} ${message[1]}`;
    } else if (message[0] == "flag") {
      reportStr = `${message[1]}\n${reportStr}`;
    } else if (message[0] == "termination") {
      inspectedLink = message[1];
      inspectedLink._id = ObjectId(inspectedLink._id);
    }
  });

  worker.on("error", (error) => {
    reportStr += `\n${logTime()} ${error}`;
  });

  worker.on("exit", (exitCode) => {
    console.log(exitCode);
    if (exitCode == 0) {
      reportStr += `\n${logTime()} Link inspection completed.`;
      reportStr =
        "--------------------- Flags ----------------------\n" + reportStr;

      logger.write(reportStr);

      //configuring parameters
      var params = {
        Bucket: process.env.BUCKET,
        Body: fs.createReadStream(fileName),
        Key: fileName,
      };

      s3.upload(params, function (err, data) {
        //handle error
        if (err) {
          console.log("Error", err);
        }

        //success
        if (data) {
          console.log(inspectedLink._id);
          console.log("Uploaded in:", data.Location);
          fs.unlinkSync(fileName);
          InspectLinks.findOne(
            { _id: inspectedLink._id },
            function (error, record) {
              if (error) console.log(error);
              else {
                record.report = data.Location;
                record.save();
              }
            }
          );
        }
      });
    }
  });

  res.send({
    message: "Link inspection request successful.",
  });
};

logTime = () => {
  return moment().tz("Asia/Singapore").format();
};