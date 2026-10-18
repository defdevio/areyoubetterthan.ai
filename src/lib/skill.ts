/**
 * Human skill on the task set, as a one-parameter item response (Rasch) model:
 *
 *   P(person solves task t) = σ(θ − b_t)
 *
 * b_t is the task's difficulty, from how many AI models failed it. θ is fitted per person as
 * a MAP estimate under a normal prior centred on the human population, so:
 *  - a short record is pulled toward the average human (1/1 can't outrank 40/50);
 *  - solving a task most models fail moves θ up a lot, missing one they all solve moves it down.
 *
 * θ is reported as the share of the whole task set the person would be expected to resolve,
 * which puts humans on the same scale as each model's "all tasks" resolve rate.
 */

export interface Observation {
  /** Task difficulty b_t (logit scale). */
  b: number;
  solved: boolean;
}

/** Prior spread of individual skill around the population mean, in logits. */
export const PRIOR_SD = 1;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Difficulty from the share of models that solved a task, smoothed so tasks every model
 * solved (or none did) stay finite.
 */
export function difficulty(solved: number, total: number): number {
  const p = (solved + 0.5) / (total + 1);
  return Math.log((1 - p) / p);
}

/** MAP estimate of θ for these observations under a N(mean, sd²) prior. */
export function fitTheta(obs: Observation[], mean: number, sd = PRIOR_SD): number {
  let theta = mean;
  // The log-posterior is strictly concave, so Newton's method converges in a few steps.
  for (let i = 0; i < 50; i++) {
    let grad = -(theta - mean) / (sd * sd);
    let hess = -1 / (sd * sd);
    for (const o of obs) {
      const p = sigmoid(theta - o.b);
      grad += (o.solved ? 1 : 0) - p;
      hess -= p * (1 - p);
    }
    const step = grad / hess;
    theta -= step;
    if (Math.abs(step) < 1e-9) break;
  }
  return theta;
}

/** Posterior standard deviation of θ (Laplace approximation). */
export function thetaSd(theta: number, obs: Observation[], sd = PRIOR_SD): number {
  let info = 1 / (sd * sd);
  for (const o of obs) {
    const p = sigmoid(theta - o.b);
    info += p * (1 - p);
  }
  return 1 / Math.sqrt(info);
}

/** Expected share of these tasks resolved at skill θ. */
export function expectedRate(theta: number, difficulties: number[]): number {
  if (!difficulties.length) return 0;
  return difficulties.reduce((acc, b) => acc + sigmoid(theta - b), 0) / difficulties.length;
}

/**
 * Where the population prior is centred: one θ fitted to every human attempt pooled, under a
 * wide prior at 0 (the level of a typical model) so it is defined before anyone has played.
 */
export function populationTheta(all: Observation[]): number {
  return fitTheta(all, 0, 2);
}
