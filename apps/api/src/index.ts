import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import "dotenv/config";
import { getWebScraperQueue } from "./services/queue-service";
import { v0Router } from "./routes/v0";
import { initSDK } from "@hyperdx/node-opentelemetry";
import cluster from "cluster";
import os from "os";
import { Logger } from "./lib/logger";
import { adminRouter } from "./routes/admin";
import { ScrapeEvents } from "./lib/scrape-events";
import http from 'node:http';
import https from 'node:https';
import CacheableLookup from 'cacheable-lookup';

const { createBullBoard } = require("@bull-board/api");
const { BullAdapter } = require("@bull-board/api/bullAdapter");
const { ExpressAdapter } = require("@bull-board/express");

const numCPUs = process.env.ENV === "local" ? 2 : os.cpus().length;
Logger.info(`Number of CPUs: ${numCPUs} available`);

const cacheable = new CacheableLookup({
  // this is important to avoid querying local hostnames see https://github.com/szmarczak/cacheable-lookup readme
  lookup: false
});

cacheable.install(http.globalAgent);
cacheable.install(https.globalAgent);

if (cluster.isPrimary) {  // Changed from isMaster to isPrimary
  Logger.info(`Primary ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    if (signal) {
      Logger.info(`Worker ${worker.process.pid} was killed by signal: ${signal}`);
    } else if (code !== 0) {
      Logger.info(`Worker ${worker.process.pid} exited with error code: ${code}`);
    } else {
      Logger.info(`Worker ${worker.process.pid} exited successfully`);
    }
    Logger.info("Starting a new worker");
    cluster.fork();
  });

  cluster.on("disconnect", (worker) => {
    Logger.info(`The worker #${worker.id} has disconnected`);
  });

} else {
  const app = express();

  global.isProduction = process.env.IS_PRODUCTION === "true";

  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json({ limit: "10mb" }));

  app.use(cors()); // Add this line to enable CORS

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(`/admin/${process.env.BULL_AUTH_KEY}/queues`);

  const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
    queues: [new BullAdapter(getWebScraperQueue())],
    serverAdapter: serverAdapter,
  });

  app.use(
    `/admin/${process.env.BULL_AUTH_KEY}/queues`,
    serverAdapter.getRouter()
  );

  app.get("/", (req, res) => {
    res.send("SCRAPERS-JS: Hello, world! Fly.io");
  });

  //write a simple test function
  app.get("/test", async (req, res) => {
    res.send("Hello, world!");
  });

  // register router
  app.use(v0Router);
  app.use(adminRouter);
  const DEFAULT_PORT = process.env.PORT ?? 3002;
  // const HOST = process.env.HOST ?? "localhost";
  const PORT = process.env.PORT ?? 8080;
  const HOST = "::";

  // HyperDX OpenTelemetry
  if (process.env.ENV === "production") {
    initSDK({ consoleCapture: true, additionalInstrumentations: [] });
  }

  function startServer(port = PORT) {
    const server = app.listen(Number(port), HOST, () => {
      Logger.info(`Worker ${process.pid} listening on port ${port}`);
      Logger.info(
        `For the Queue UI, open: http://${HOST}:${port}/admin/${process.env.BULL_AUTH_KEY}/queues`
      );
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        Logger.error(`Port ${port} is already in use`);
        setTimeout(() => {
          server.close();
          startServer(port);
        }, 1000);
      } else if (error.code === 'EPIPE') {
        Logger.error('EPIPE error occurred. Restarting server...');
        setTimeout(() => {
          server.close();
          startServer(port);
        }, 1000);
      } else {
        Logger.error('Unexpected server error:', error);
      }
    });

    process.on('uncaughtException', (error: Error) => {
      Logger.error('Uncaught Exception:', error);
      // Gracefully shutdown
      server.close(() => {
        process.exit(1);
      });
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Gracefully shutdown
      server.close(() => {
        process.exit(1);
      });
    });

    return server;
  }

  if (require.main === module) {
    startServer();
  }

  Logger.info(`Worker ${process.pid} started`);

  app.get(`/serverHealthCheck`, async (req, res) => {
    try {
      const webScraperQueue = getWebScraperQueue();
      const [waitingJobs] = await Promise.all([
        webScraperQueue.getWaitingCount(),
      ]);

      const noWaitingJobs = waitingJobs === 0;
      // 200 if no active jobs, 503 if there are active jobs
      return res.status(noWaitingJobs ? 200 : 500).json({
        waitingJobs,
      });
    } catch (error) {
      Logger.error(error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/serverHealthCheck/notify", async (req, res) => {
    if (process.env.SLACK_WEBHOOK_URL) {
      const treshold = 1; // The treshold value for the active jobs
      const timeout = 60000; // 1 minute // The timeout value for the check in milliseconds

      const getWaitingJobsCount = async () => {
        const webScraperQueue = getWebScraperQueue();
        const [waitingJobsCount] = await Promise.all([
          webScraperQueue.getWaitingCount(),
        ]);

        return waitingJobsCount;
      };

      res.status(200).json({ message: "Check initiated" });

      const checkWaitingJobs = async () => {
        try {
          let waitingJobsCount = await getWaitingJobsCount();
          if (waitingJobsCount >= treshold) {
            setTimeout(async () => {
              // Re-check the waiting jobs count after the timeout
              waitingJobsCount = await getWaitingJobsCount();
              if (waitingJobsCount >= treshold) {
                const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
                const message = {
                  text: `⚠️ Warning: The number of active jobs (${waitingJobsCount}) has exceeded the threshold (${treshold}) for more than ${
                    timeout / 60000
                  } minute(s).`,
                };

                if (slackWebhookUrl) {
                  const response = await fetch(slackWebhookUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(message),
                  });

                  if (!response.ok) {
                    Logger.error("Failed to send Slack notification");
                  }
                }
              }
            }, timeout);
          }
        } catch (error) {
          Logger.debug(error instanceof Error ? error : 'Unknown error');
        }
      };

      checkWaitingJobs();
    }
  });

  app.get("/is-production", (req, res) => {
    res.send({ isProduction: global.isProduction });
  });

  Logger.info(`Worker ${process.pid} started`);
}

const wsq = getWebScraperQueue();

wsq.on("waiting", j => ScrapeEvents.logJobEvent(j, "waiting"));
wsq.on("active", j => ScrapeEvents.logJobEvent(j, "active"));
wsq.on("completed", j => ScrapeEvents.logJobEvent(j, "completed"));
wsq.on("paused", j => ScrapeEvents.logJobEvent(j, "paused"));
wsq.on("resumed", j => ScrapeEvents.logJobEvent(j, "resumed"));
wsq.on("removed", j => ScrapeEvents.logJobEvent(j, "removed"));