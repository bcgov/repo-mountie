//
// Repo Mountie
//
// Copyright © 2018 Province of British Columbia
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Created by Jason Leach on 2018-10-01.
//

import { logger } from '@bcgov/nodejs-common-utils';
import { Application, Context } from 'probot';
import createScheduler from 'probot-scheduler';
import { SCHEDULER_DELAY } from './constants';
import { addLicenseIfRequired } from './libs/repository';

export = (app: Application) => {
  logger.info('Loaded!!!');

  const scheduler = createScheduler(app, {
    delay: false, // !!process.env.DISABLE_DELAY, // delay is enabled on first run
    interval: SCHEDULER_DELAY,
  });

  app.on('schedule.repository', repositoryScheduled);
  app.on('repository.deleted', repositoryDelete);

  async function repositoryDelete(context: Context) {
    scheduler.stop(context.payload.repository);
  }

  async function repositoryScheduled(context: Context) {
    logger.info(`Processing ${context.payload.repository.name}`);

    try {
      await addLicenseIfRequired(context, scheduler);
    } catch (err) {
      logger.error(`Unable to add license to ${context.payload.repository.name}`);
    }
  }
};