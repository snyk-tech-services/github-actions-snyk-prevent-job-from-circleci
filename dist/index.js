"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const github = require('@actions/github');
const core = require('@actions/core');
const sleep_promise_1 = __importDefault(require("sleep-promise"));
const axios_1 = __importDefault(require("axios"));
const snyk_delta_1 = require("snyk-delta");
let POLL_TIMEOUT = 60000;
async function runAction() {
    try {
        const ghToken = core.getInput('ghToken');
        const snykToken = core.getInput('snykToken');
        const circleCIToken = core.getInput('CIRCLECITOKEN');
        const workflowName = core.getInput('workflowName');
        const snykTestOutputFilename = core.getInput('snykTestOutputFilename');
        POLL_TIMEOUT = parseInt(core.getInput('timeout'));
        const payload = github.context.payload;
        const ORGANIZATION = payload.repository.owner.login;
        const REPO = payload.repository.name;
        const BRANCH = payload.pull_request.head.ref;
        process.env.SNYK_TOKEN = snykToken;
        const octokit = new github.GitHub(ghToken);
        if (ghToken == '' || snykToken == '' || circleCIToken == '') {
            throw new Error('Required tokens cannot be empty');
        }
        const checkSuites = await octokit.checks.listSuitesForRef({
            owner: ORGANIZATION,
            repo: REPO,
            ref: BRANCH,
        });
        const checkSuitesArray = checkSuites.data.check_suites;
        let checkSuiteId = 0;
        checkSuitesArray.forEach(checksuite => {
            if (checksuite && checksuite.app.slug == 'circleci-checks') {
                checkSuiteId = checksuite.id;
            }
        });
        if (checkSuiteId == 0) {
            throw new Error("Couldn't find circleci-checks checksuite ID");
        }
        const completedRun = await pollSuiteTillCompletion(octokit, ORGANIZATION, REPO, checkSuiteId, workflowName);
        const summaryLine = completedRun.output.summary;
        const circleCiBuildNumber = summaryLine.replace(REPO + "/", "?").split('?')[1];
        const artifactListResponse = await axios_1.default.get(`https://circleci.com/api/v1.1/project/github/${ORGANIZATION}/${REPO}/${circleCiBuildNumber}/artifacts?circle-token=${circleCIToken}`);
        const artifactArray = artifactListResponse.data;
        let snykArtifactUrl = '';
        artifactArray.forEach(artifact => {
            if (artifact['pretty_path'] == snykTestOutputFilename) {
                snykArtifactUrl = artifact['url'];
            }
        });
        const artifactResponse = await axios_1.default.get(`${snykArtifactUrl}?circle-token=${circleCIToken}`);
        const currentTestResults = artifactResponse.data;
        const testDataFormatted = typeof currentTestResults == 'string' ? currentTestResults : JSON.stringify(currentTestResults);
        console.log(await snyk_delta_1.getDelta(testDataFormatted));
    }
    catch (err) {
        core.setFailed(err);
    }
}
const pollSuiteTillCompletion = async (octokit, owner, repo, checkSuiteId, workflowName, startTime) => {
    const firstCallTime = startTime ? startTime : Date.now();
    let run = await getSuite(octokit, owner, repo, checkSuiteId, workflowName);
    if (isEmpty(run)) {
        throw new Error(`CircleCI test suite not found for ${workflowName} workflow`);
    }
    else if (run['status'] != 'completed') {
        if (Date.now() - firstCallTime > POLL_TIMEOUT) {
            throw new Error(`Reached Time waiting for ${workflowName} to complete`);
        }
        await sleep_promise_1.default(5000);
        return await pollSuiteTillCompletion(octokit, owner, repo, checkSuiteId, workflowName);
    }
    else if (run['status'] == 'completed' && run['conclusion'] == 'success') {
        return run;
    }
    else {
        throw new Error('Cannot work if your build does not pass');
    }
};
const getSuite = async (octokit, owner, repo, checkSuiteId, workflowName) => {
    const runsForSuite = await octokit.checks.listForSuite({
        owner: owner,
        repo: repo,
        check_suite_id: checkSuiteId,
    });
    let runObject = '{}';
    runsForSuite.data.check_runs.forEach(run => {
        if (run.name == workflowName) {
            runObject = run;
        }
    });
    return runObject;
};
const isEmpty = (obj) => {
    for (var key in obj) {
        if (obj.hasOwnProperty(key))
            return false;
    }
    return true;
};
runAction();
//# sourceMappingURL=index.js.map