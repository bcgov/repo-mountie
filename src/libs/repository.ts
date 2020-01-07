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
// Created by Jason Leach on 2018-10-02.
//

import { logger } from '@bcgov/common-nodejs-utils';
import { Context } from 'probot';
import config from '../config';
import { ACCESS_CONTROL, BRANCHES, COMMIT_MESSAGES, FILE_NAMES, PR_TITLES, TEMPLATES, TEXT_FILES } from '../constants';
import { addFileViaPullRequest, checkIfRefExists, extractMessage, fileExists, hasPullRequestWithTitle, loadTemplate } from './utils';

export const addSecurityComplianceInfoIfRequired = async (context: Context, scheduler: any = undefined) => {

  // This feature is guarded by a feature-flag.
  if ((config.get('environment') !== 'test') && (!ACCESS_CONTROL.complianceBetaGroup.includes(context.payload.repository.name))) {
    logger.info(`The repo ${context.payload.repository.name} is not part of the beta group`);
    return;
  }

  try {
    if ((await fileExists(context, FILE_NAMES.COMPLIANCE))) {
      logger.info(`This repo already has a compliance file, ${context.payload.repository.name}`);
      return;
    }

    if (!(await checkIfRefExists(context, context.payload.repository.default_branch))) {
      logger.info(`This repo has no main branch, ${context.payload.repository.name}`);
      return;
    }

    if ((await hasPullRequestWithTitle(context, PR_TITLES.ADD_COMPLIANCE))) {
      logger.info(`Compliance PR exists in, ${context.payload.repository.name}`);
      return;
    }

    // Add a license via a PR
    const prMessageBody: string = await loadTemplate(TEXT_FILES.WHY_COMPLY);
    const data: string = (await loadTemplate(TEMPLATES.COMPLIANCE))
      .split('[TODAY]').join(new Date().toISOString());

    await addFileViaPullRequest(context, COMMIT_MESSAGES.ADD_COMPLIANCE,
      PR_TITLES.ADD_COMPLIANCE, prMessageBody, BRANCHES.ADD_COMPLIANCE,
      FILE_NAMES.COMPLIANCE, data);
  } catch (err) {
    const message = extractMessage(err);
    if (message) {
      logger.error(`Error adding compliance to ${context.payload.repository.name}`);
    } else {
      logger.error(err.message);
    }

    throw err;
  }
};

export const addLicenseIfRequired = async (context: Context, scheduler: any = undefined) => {
  if (context.payload.repository.license) {
    // we have a license already
    return;
  }

  try {
    if (!(await checkIfRefExists(context, context.payload.repository.default_branch))) {
      logger.info(`This repo has no main branch ${context.payload.repository.name}`);
      return;
    }

    if ((await hasPullRequestWithTitle(context, PR_TITLES.ADD_LICENSE))) {
      logger.info(`Licencing PR exists in ${context.payload.repository.name}`);
      return;
    }

    // Add a license via a PR
    const prMessageBody: string = await loadTemplate(TEXT_FILES.WHY_LICENSE);
    const licenseData: string = await loadTemplate(TEMPLATES.LICENSE);

    await addFileViaPullRequest(context, COMMIT_MESSAGES.ADD_LICENSE,
      PR_TITLES.ADD_LICENSE, prMessageBody, BRANCHES.ADD_LICENSE,
      FILE_NAMES.LICENSE, licenseData);
  } catch (err) {
    const message = extractMessage(err);
    if (message) {
      logger.error(`Unable to add license to ${context.payload.repository.name}`);
    } else {
      logger.error(err.message);
    }

    throw err;
  }
};
