"use strict";

require('dotenv').load();
const axios = require('axios');
const mysql = require('mysql');
const Queue = require('better-queue');
const Stopwatch = require('timer-stopwatch');
const aiMktApi = require('@nuance/ai-marketplace-api');
const config = require('./config.js');

const modelEndpoint = process.env.MODEL_ENDPOINT;

const connPool = mysql.createPool({
  connectionLimit: 25,
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS,
  database: process.env.MYSQL_DB
});
const aiTransactionManager = new aiMktApi(process.env.AI_TRANSACTIONS_ENDPOINT, 
                                          process.env.AI_TRANSACTIONS_KEY)
const stopwatch = new Stopwatch({ refreshRateMS: 300 }); // After Queue is populated this gets timestamped below
const startDate = new Date();
const queues = [];
let activeQCount = 0;
let transactionIdStart = 0;
let transactionIdEnd = 0;

config.jobs.forEach(job => {
  const q = new Queue(submitJob, {
    autoResume: false,
    concurrent: 1,
    id: 'model-' + job.modelId
  });
  activeQCount++;
  // connect event listener to each model's queue to handle final tasks
  q.on('drain', () => {
    activeQCount--;
    if (activeQCount === 0) {
      console.log('All jobs have been submitted for this test run.');
      registerTestRun({
        startDate,
        endDate: new Date(),
        description: config.name,
        environment: config.environment,
        transactionIdStart,
        transactionIdEnd
      });
    }
  });
  queues.push(q);

  const upIntervals = Math.round(job.duration * 6);
  job.totalStudies = Math.round(job.peakLoad * upIntervals);
  job.loadIncrement = Math.round(job.peakLoad / upIntervals);
  job.count = 0;
});

loadQueues();

function loadQueues() {
  connPool.getConnection((err, conn) => {
    if (err) console.error(err);
    const models = config.jobs.map(job => job.modelId).join();
    conn.query(
      `SELECT accession_number, study_uid, model_id, ` +
        `  GROUP_CONCAT(image_uri) as uris ` +
        `FROM images WHERE model_id in (${models}) GROUP BY study_id`,
      (err, rows) => {
        if (err) throw err;
        rows.forEach(row => {
          const modelIndex = row.model_id - 1;
          if (
            config.jobs[modelIndex].count <=
            config.jobs[modelIndex].totalStudies
          ) {
            const jobData = {
              modelId: row.model_id,
              studyUid: row.study_uid,
              accessionNumber: row.accession_number,
              uris: row.uris.split(',')
            };
            queues[modelIndex].push(jobData);
            config.jobs[modelIndex].count++;
          }
        });
        conn.release();
        queues.forEach(q => q.resume());
        stopwatch.start();
      }
    );
  });
}

async function submitJob(input, cb) {
  const { modelToken, serviceId, loadIncrement, duration } = config.jobs[
    input.modelId - 1
  ];
  const waitTime = calculateWaitTime(loadIncrement, duration);
  console.log(
    `Waiting ${Math.round(waitTime / 1000)} seconds before sending next job ` +
      `for model ${input.modelId}.`
  );
  setTimeout(async () => {
    try {
      const { transactionId } = await aiTransactionManager.createTransaction({
        serviceId,
        studyUid: input.studyUid,
        accessionNumber: input.accessionNumber
      });

      if (transactionIdStart === 0) transactionIdStart = transactionId;
      if (transactionIdEnd < transactionId) transactionIdEnd = transactionId;

      await makeAiJobRequest(modelEndpoint, {
        modelId: input.modelId,
        transactionId,
        uris: input.uris
      },
      modelToken
      );
      console.log(
        `Model ID: ${input.modelId} completed ${input.studyUid}. ` +
          `Time: ${Math.round(stopwatch.ms / 60000)} / ` +
          `${config.jobs[input.modelId - 1].duration * 60} minutes`
      );
      cb();
    } catch (err) {
      // If something goes wrong (e.g. some endpoint connection issue) log it and keep going
      console.error(err);
      cb();
    }
  }, waitTime);
}

async function makeAiJobRequest(url, payload, token) {
  return axios.post(url, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token
    }
  });
}

function calculateWaitTime(loadIncrement, duration) {
  const currIncrement = Math.floor(stopwatch.ms / 300000) + 1;
  if (currIncrement < duration * 6) {
    // we're still increasing
    // wait time between sends is 300000ms (5 minutes) divided by total studies
    // at the current load level
    return 300000 / (loadIncrement * currIncrement);
  } else {
    // load is decreasing
    const maxLoad = duration * 6 * loadIncrement;
    const downSteps = (currIncrement - duration * 6) * loadIncrement;
    return 300000 / (maxLoad - downSteps);
  }
}

async function registerTestRun(data) {
  const {
    startDate,
    endDate,
    description,
    environment,
    transactionIdStart,
    transactionIdEnd
  } = data;
  connPool.getConnection((err, conn) => {
    if (err) console.error(err);
    conn.query(
      `INSERT INTO test_runs SET ?`,
      {
        start_date: startDate,
        end_date: endDate,
        description,
        environment,
        transaction_id_start: transactionIdStart,
        transaction_id_end: transactionIdEnd
      },
      (err) => {
        if (err) throw err;
        conn.release();
        if (err) console.error(err);
      }
    );
  });
}
