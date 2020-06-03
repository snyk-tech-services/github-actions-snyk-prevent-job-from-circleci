# Demo for github-actions-snyk-prevent-job-from-circleci

Sample gradle project with CircleCI pipeline saving the test output for snyk to pick up in github action.
[Example PR](https://github.com/snyk-tech-services/gradle-sample/pull/9)

![](https://storage.googleapis.com/snyk-technical-services.appspot.com/sample-gradle-gh-action-snyk-prevent-readme.png)

# How to use the action?
## Action
[github.com/snyk-tech-services/github-actions-snyk-prevent-job-from-circleci](https://github.com/snyk-tech-services/github-actions-snyk-prevent-job-from-circleci)



> The action checks on the Circle CI test suite, polling and waiting for the specified CircleCI workflow to complete successfully. See below the way to configure the Snyk Orb to achieve this behavior.

### Action Inputs
- **ghToken**\
  description: 'Github token'\
  required: true\
  default: ''

- **snykToken**\
  description: 'snyk token'\
  required: true\
  default: ''

- **circleCIToken**
  description: 'CircleCI token (create one in API permissions)'\
  required: true\
  default: ''

- **workflowName**\
  description: 'CircleCI Workflow Name running snyk test (where we expect the file saved as artifact)'\
  required: true\
  default: 'workflow'

- **snykTestOutputFilename**\
  description: 'Artifact Filename containing the Snyk test --json output'\
  required: true\
  default: 'snykTestResults'

- **timeout**\
  description: 'Timeout till we stop waiting for CircleCI job to complete'\
  required: false\
  default: '60000'


## Simplest CircleCI Job for Gradle
> **To run on PRs only**

Tweaked from CircleCI default template\
Uses Snyk Orb.\
Build only template-core subproject here for the sake of example.\
Pay special special attention to `working_directory` name that must match the repo name since that'll be the name of the monitored project.

Important parts:
1. working_directory to match the repo name (so it matches the name of monitored project. if using remote-repo-url, should be tweaked to match accordingly).
2. Snyk Orb
- fail-on-issues: false
- monitor-on-build: false for PRs, true for default branch
- Token obviously
- additional-arguments: 
    * --sub-project=template-core (or whatever gradle details)
    * --json-file-output=snykTestResults (name must match input)
3. Save artifact name like --json-file-ouput using the same name

```
version: 2.1
orbs:
    snyk: snyk/snyk@0.0.10
jobs:
  build:
    docker:
      # specify the version you desire here
      - image: circleci/openjdk:8-jdk

    # Below must match the repo name
    working_directory: ~/gradle-sample

    # Don't actually know if I need that haha
    environment:
      # Customize the JVM maximum heap limit
      JVM_OPTS: -Xmx3200m
      TERM: dumb

    steps:
      - checkout

      # Download and cache dependencies
      - restore_cache:
          keys:
            - v1-dependencies-{{ checksum "build.gradle" }}
            # fallback to using the latest cache if no exact match is found
            - v1-dependencies-

      - run: ./gradlew clean build

      - snyk/scan:
          fail-on-issues: false
          monitor-on-build: false
          token-variable: SNYK_TOKEN
          additional-arguments: --sub-project=template-core --json-file-output=snykTestResults
      
      # same can be run without the orb, pulling the snyk cli and running command like this one
      #- run: snyk test --sub-project=template-core --print-deps --json > snykTestResults || true
      
      - store_artifacts:
          path: snykTestResults
          destination: snykTestResults

      - save_cache:
          paths:
            - ~/.gradle
          key: v1-dependencies-{{ checksum "build.gradle" }}
```

## Github Action workflow
Using ghToken, snykToken, and circleCIToken as secret in repo.
```
name: Snyk-TS-PR-Check

on: 
  pull_request:
    types: [opened,reopened,synchronized]
  
jobs:
  snyk_check:
    runs-on: ubuntu-latest
    name: Snyk PR Check
    steps:
    - name: Snyk prevent
      id: snyk-prevent
      uses: snyk-tech-services/github-actions-snyk-prevent-job-from-circleci@master
      with:
        ghToken: ${{ secrets.ghToken }}
        snykToken: ${{ secrets.snykToken }}
        circleCIToken: ${{ secrets.circleCIToken }}
        workflowName: workflow
        snykTestOutputFilename: snykTestResults
```