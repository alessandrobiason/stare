import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/pipeline.yml", "utf8"));
type Step = { uses?: string; with?: Record<string, unknown>; run?: string; if?: string };
type Job = { needs?: string | string[]; if?: string; steps: Step[]; "continue-on-error"?: boolean };
const jobs: Record<string, Job> = workflow.jobs;
const needs = (job: Job): string[] => typeof job.needs === "string" ? [job.needs] : job.needs ?? [];

// GitHub applies success() to job conditions by default. The explicit checks
// below protect that behavior from always()/failure() or allow-failure overrides.
function requested(job: Job, event: string, operation: string): boolean {
  const expression = job.if!.replace(/github.event_name/g, "event").replace(/inputs.operation/g, "operation");
  return new Function("event", "operation", `return (${expression});`)(event, operation);
}

test("there is one workflow and Stage 2 always follows Check", () => {
  expect(readdirSync(".github/workflows").filter((file) => /\.ya?ml$/.test(file))).toEqual(["pipeline.yml"]);
  expect(workflow.on.push.branches).toEqual(["main"]);
  expect(workflow.on).toHaveProperty("pull_request");
  expect(workflow.on.push).not.toHaveProperty("paths");
  expect(workflow.on.workflow_dispatch.inputs.operation.default).toBe("validate");
  expect(needs(jobs.screenshots)).toEqual(["check"]);
  expect(jobs.check.if).toBeUndefined();
  expect(jobs.screenshots.if).toBeUndefined();
});

test.each(["testflight", "ota"])("%s requires both successful gates in its own run", (publisher) => {
  const job = jobs[publisher];
  expect(needs(job)).toEqual(expect.arrayContaining(["check", "screenshots"]));
  for (const key of [publisher, "check", "screenshots"]) {
    expect(jobs[key]["continue-on-error"]).toBeUndefined();
    expect(jobs[key].if ?? "").not.toMatch(/always\(|failure\(|cancelled\(|!cancelled\(/);
    for (const step of jobs[key].steps) expect(step).not.toHaveProperty("continue-on-error");
  }
  for (const event of ["push", "pull_request", "workflow_dispatch"]) {
    for (const operation of workflow.on.workflow_dispatch.inputs.operation.options) {
      expect(requested(job, event, operation)).toBe(event === "workflow_dispatch" && operation === publisher);
    }
  }
});

test("all jobs use the run SHA, and screenshot success requires fresh captures", () => {
  for (const job of Object.values(jobs)) {
    const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with?.ref).toBe("${{ github.sha }}");
  }
  expect(jobs.screenshots.steps.map((step) => step.run ?? "").join("\n"))
    .toContain("node tools/ci/check-screenshots.mjs");
  expect(readFileSync("tools/ci/check-screenshots.mjs", "utf8")).toContain("tools/screenshots/.capture");
  expect(readFileSync("tools/ota-update.sh", "utf8")).toContain("gh workflow run pipeline.yml");
  expect(readFileSync("tools/ota-update.sh", "utf8")).not.toContain("eas-cli");
});

test("manual releases cannot be cancelled by a new validation push", () => {
  expect(workflow.concurrency.group).toContain("github.run_id");
  expect(workflow.concurrency["cancel-in-progress"]).toBe("${{ github.event_name != 'workflow_dispatch' }}");
  for (const publisher of ["testflight", "ota"]) {
    expect(workflow.jobs[publisher].concurrency["cancel-in-progress"]).toBe(false);
  }
});
