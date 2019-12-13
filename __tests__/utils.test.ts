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
// Created by Jason Leach on 2018-10-04.
//

import fs from 'fs';
import path from 'path';
import { Application, Context } from 'probot';
import robot from '../src';
import { PR_TITLES, REPO_COMPLIANCE_FILE } from '../src/constants';
import { addFileViaPullRequest, assignUsersToIssue, checkIfFileExists, checkIfRefExists, extractMessage, fetchComplianceFile, fetchConfigFile, fetchContentsForFile, fetchFile, hasPullRequestWithTitle, labelExists, loadTemplate, updateFile } from '../src/libs/utils';

jest.mock('fs');

const p0 = path.join(__dirname, 'fixtures/schedule-lic.json');
const repoScheduledEvent = JSON.parse(fs.readFileSync(p0, 'utf8'));

const p1 = path.join(__dirname, 'fixtures/repo-get-content-compliance.json');
const complianceResponse = JSON.parse(fs.readFileSync(p1, 'utf8'));

const p2 = path.join(__dirname, 'fixtures/repo-get-content-config.json');
const configResponse = JSON.parse(fs.readFileSync(p2, 'utf8'));

const p3 = path.join(__dirname, 'fixtures/master.json');
const master = JSON.parse(fs.readFileSync(p3, 'utf8'));

const p4 = path.join(__dirname, 'fixtures/issues-empty.json');
const prNoAddLicense = JSON.parse(fs.readFileSync(p4, 'utf8'));

const p5 = path.join(__dirname, 'fixtures/issues-and-pulls.json');
const prWithLicense = JSON.parse(fs.readFileSync(p5, 'utf8'));

const p6 = path.join(__dirname, 'fixtures/repo-list-commits.json');
const listCommits = JSON.parse(fs.readFileSync(p6, 'utf8'));

describe('Utility functions', () => {
  let app;
  let github;
  let context;

  beforeEach(() => {
    app = new Application();
    app.app = { getSignedJsonWebToken: () => 'xxx' };
    app.load(robot);

    github = {
      issues: {
        listLabelsForRepo: jest.fn(),
        addAssignees: jest.fn(),
      },
      repos: {
        listCommits: jest.fn().mockReturnValue(Promise.resolve(listCommits)),
        getContents: jest.fn(),
        createFile: jest.fn(),
        createOrUpdateFile: jest.fn(),
      },
      git: {
        getRef: jest.fn(),
        createRef: jest.fn(),
      },
      pulls: {
        create: jest.fn().mockReturnValueOnce(Promise.resolve()),
        list: jest.fn().mockReturnValueOnce(Promise.resolve(prNoAddLicense)),
      },
    };

    // Passes the mocked out GitHub API into out app instance
    app.auth = () => Promise.resolve(github);

    context = new Context(repoScheduledEvent, github as any, {} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('A template can be loaded', async () => {
    const data = await loadTemplate('some-file');
    expect(data).not.toBeUndefined();
  });

  it('A file with no read access throws', async () => {
    await expect(loadTemplate('no-file-access')).rejects.toThrow(Error);
  });

  it('A non-existent template throws', async () => {
    await expect(loadTemplate('no-file')).rejects.toThrow(Error);
  });

  it('API error message extracted from Error message', async () => {
    const err = new Error('{"message": "Hello World"}');
    const message = await extractMessage(err);
    expect(message).toEqual('Hello World');
  });

  it('Labels should be fetched for lookup', async () => {
    await labelExists(context, 'blarb');
    expect(github.issues.listLabelsForRepo).toHaveBeenCalled();
  });

  it('A file should be retrieved.', async () => {
    github.repos.getContents = jest.fn().mockReturnValueOnce(Promise.resolve(complianceResponse));
    const data = await fetchFile(context, REPO_COMPLIANCE_FILE);

    expect(data).toMatchSnapshot();
  });

  it('A file should not be retrieved.', async () => {
    await expect(fetchFile(context, 'blarb.txt')).rejects.toThrow(Error);
  });

  it('The compliance file should be retrieved.', async () => {
    github.repos.getContents = jest.fn().mockReturnValueOnce(Promise.resolve(complianceResponse));
    const data = await fetchComplianceFile(context);

    expect(github.repos.getContents).toHaveBeenCalled();
    expect(data).toMatchSnapshot();
  });

  it('The config file should be retrieved.', async () => {
    github.repos.getContents = jest.fn().mockReturnValueOnce(Promise.resolve(configResponse));
    const data = await fetchConfigFile(context);

    expect(github.repos.getContents).toHaveBeenCalled();
    expect(data).toMatchSnapshot();
  });

  it('The ref should exists.', async () => {
    github.git.getRef.mockReturnValueOnce(master);
    const result = await checkIfRefExists(context, 'master');

    expect(github.git.getRef).toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it('The ref should not exists.', async () => {
    github.git.getRef.mockReturnValueOnce(Promise.reject());
    const result = await checkIfRefExists(context, 'master');

    expect(github.git.getRef).toHaveBeenCalled();
    expect(result).toBeFalsy();
  });

  it('A file should be added by PR', async () => {
    github.git.getRef.mockReturnValueOnce(master);
    await addFileViaPullRequest(context, 'Hello', 'World',
      'This is a body.', 'blarb', 'blarb.txt', 'some-data-here');

    expect(github.git.getRef).toHaveBeenCalled();
    expect(github.pulls.create).toHaveBeenCalled();
    expect(github.git.createRef).toHaveBeenCalled();
    expect(github.repos.createFile).toHaveBeenCalled();
  });

  it('A pull request should not exists', async () => {
    const result = await hasPullRequestWithTitle(context, 'Hello');

    expect(result).toBeFalsy();
  });

  it.skip('A pull request should exists', async () => {
    github.pulls.list.mockReturnValueOnce(Promise.resolve(prWithLicense));

    const result = await hasPullRequestWithTitle(context, PR_TITLES.ADD_LICENSE);

    expect(result).toBeTruthy();
  });

  it('Assigning an issue on GitHub should succeed', async () => {
    github.issues.addAssignees = jest.fn().mockReturnValueOnce(Promise.resolve());

    await expect(assignUsersToIssue(context, ['blarb'])).resolves.toBeUndefined();
  });

  it('Assigning an issue on GitHub should fail', async () => {
    github.issues.addAssignees = jest.fn().mockReturnValueOnce(Promise.reject());

    await expect(assignUsersToIssue(context, ['blarb'])).rejects.toThrow();
  });

  it('File contents should be retrieved', async () => {
    github.repos.getContents = jest.fn().mockReturnValueOnce(Promise.resolve(complianceResponse));
    const results = await fetchContentsForFile(context, 'helo.yaml');

    expect(github.repos.listCommits).toHaveBeenCalled();
    expect(github.repos.getContents).toHaveBeenCalled();
    expect(results).toMatchSnapshot();
  });

  it('Updating a file on GitHub succeeds', async () => {
    github.repos.createOrUpdateFile = jest.fn().mockReturnValueOnce(Promise.resolve());

    await expect(updateFile(context, 'Hello', 'Hello', 'Hello.txt', 'data', '1bc3')).resolves.toBeUndefined();
  });

  it('Updating a file on GitHub fails', async () => {
    github.repos.createOrUpdateFile = jest.fn().mockReturnValueOnce(Promise.reject());

    await expect(updateFile(context, 'Hello', 'Hello', 'Hello.txt', 'data', '1bc3')).rejects.toThrow();
  });

  it('Return true if a file exists', async () => {
    github.repos.getContents = jest.fn().mockReturnValueOnce(Promise.resolve(complianceResponse));

    await expect(checkIfFileExists(context, 'hello.yaml')).resolves.toBeTruthy();
  });

  it('Return false if a file does not exist', async () => {
    github.repos.getContents = jest.fn().mockReturnValueOnce(Promise.reject());

    await expect(checkIfFileExists(context, 'hello.yaml')).resolves.toBeFalsy();
  });
});
