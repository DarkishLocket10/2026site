---
layout: ../../layouts/MarkdownPostLayout.astro
title: Comparing three classic 1D search methods
author: Yash Patel
description: "Minimizer? I hardly know her!"
image:
    url: "/postphotos/post 3 - Lines/outputs.png"
    alt: "Figure 1: Left represents the graph in a rectilinear grid, right represents the graph when plotted according to a computed clustering of vertices"
pubDate: 2025-07-29
tags: ["Blog", "Computer Science"]
showHero: false
---

### What are we doing?

Finding a minimizer is a deceptively simple goal: we want the point where a function bottoms‑out. Getting to that point can be wildly different depending on the algorithm we choose. In this post, I revisit three classic one‑dimensional search methods—**quadratic approximation**, **fixed‑step gradient descent**, and **backtracking (Armijo) line search**, and pit them against the same trio of textbook functions.

My aim is two‑fold:

1. **Accuracy** – Does the algorithm land on (or close to) the true minimizer?
2. **Efficiency** – How many iterations does it take to get there?


*(All functions come from Antoniou & Lu, *Practical Optimization*, Page 115, exercises 4.2-4.6.)*

---

### The Three Contestants

| Label  | Function $f(t)$                                                | Starting point      |
| ------ | -------------------------------------------------------------- | ------------ |
| **f₁** | $e^{3t} + 5e^{-2t}$                                            | $[0,\,1]$    |
| **f₂** | $\ln^2 t - 2 + \ln^2(10-t) - t^{0.2}$  *(domain $0<t<10$)*   | $[6,\,9.9]$  |
| **f₃** | $-3t\sin(0.75t) + e^{-2t}$                                     | $[0,\,2\pi]$ |


---

### Quadratic Approximation

A single Taylor expansion anchors the entire search. At a chosen point $t_1$ we evaluate the function, its gradient, and its Hessian matrix:

$$
f(t_1),\;\;  g(t_1)=f'(t_1),\;\;  h(t_1)=f''(t_1).
$$

Those three numbers pin down a local quadratic model

$$
q(t)=a\,t^2+b\,t+c,
$$

whose stationary point is

$$
t_{\text{stat}} = -\frac{b}{2a}.
$$


```matlab
[fcoef, tstat] = quadapprox(fgh1, t1);
```


**Upshot:** Incredibly quick, but if the initial point is poorly chosen or the function is far from quadratic, the resulting accuracy suffers.

---

### Fixed‑Step Gradient Descent

Classic steepest descent with a constant step size $s$ (here $s = \tfrac{1}{100}$ of the bracket width). Each update is

$$
t_{k+1}=t_k - s\,g(t_k).
$$

```matlab
[tmin, fmin, ix] = steepfixed(fg1, t0, s);
```

A small stepsize keeps things safe, but the cost is speed. A large stepsize risks a ping-pong around the minimizer.

---

### Backtracking (Armijo) Line Search

Start with a generous step $s_0$ ($\tfrac{1}{10}$ of the bracket) and shrink it geometrically ($s \leftarrow \beta s$, $\beta=0.5$) until Armijo’s condition holds:

$$
f\bigl(t_k + \beta^{\gamma}s_{0}\,d_k\bigr)
  \le
f(t_k) + \alpha_k\,\beta^{\gamma}s_{0}\,g(t_k)\,d_k .
$$



```matlab
[tmin, fmin, ix] = steepline(fg1, t0, s0, beta, alpha);
```

Think of it as a smarter version of fixed‑step: it *learns* how far it can safely go.

---

### Results

<div class="table-html">
<table class="comparison-table">
  <thead>
    <tr>
      <th>Function</th>
      <th>Method</th>
      <th>t_est</th>
      <th>f_est</th>
      <th>Iterations</th>
      <th>abs(f_est − f_true)</th>
    </tr>
  </thead>

  <tbody>
    <!-- f1 rows -->
    <tr class="f1">
      <td>f1</td><td>Quadratic</td><td>0.679</td><td>8.953</td><td></td><td>3.804e+00</td>
    </tr>
    <tr class="f1">
      <td>f1</td><td>Fixed&nbsp;step</td><td>0.241</td><td>5.148</td><td>32.0</td><td>1.264e‑10</td>
    </tr>
    <tr class="f1">
      <td>f1</td><td>Backtracking</td><td>0.241</td><td>5.148</td><td>9.0</td><td>8.382e‑11</td>
    </tr>
    <tr class="f2">
      <td>f2</td><td>Quadratic</td><td>9.830</td><td>4.776</td><td></td><td>3.570e+00</td>
    </tr>
    <tr class="f2">
      <td>f2</td><td>Fixed&nbsp;step</td><td>8.624</td><td>1.205</td><td>597.0</td><td>6.859e‑09</td>
    </tr>
    <tr class="f2">
      <td>f2</td><td>Backtracking</td><td>8.624</td><td>1.205</td><td>58.0</td><td>4.066e‑09</td>
    </tr>
    <tr class="f3">
      <td>f3</td><td>Quadratic</td><td>6.566</td><td>19.257</td><td></td><td>2.653e+01</td>
    </tr>
    <tr class="f3">
      <td>f3</td><td>Fixed&nbsp;step</td><td>2.706</td><td>‑7.274</td><td>34.0</td><td>6.462e‑10</td>
    </tr>
    <tr class="f3">
      <td>f3</td><td>Backtracking</td><td>2.706</td><td>‑7.274</td><td>6.0</td><td>5.833e‑10</td>
    </tr>
  </tbody>
</table>
</div>
<img src="/postphotos/post 3 - Lines/table.png" alt="Table preview" class="table-img" loading="lazy" />


† *Caveat:* for **f₃** the quadratic model returns the stationary point of the approximation, not the true minimizer (which is near $t=–7.274$). The mismatch illustrates how brittle a single‑point quadratic fit can be on oscillatory functions.

### Graphs

<figure>
    <img src="/postphotos/post 3 - Lines/outputs.png" alt="" />
    <figcaption>Convergence traces for the three test functions.</figcaption>
</figure>

---

### Discussion

*Quadratic Approximation* is wildly quick. One shot and done, but it gambles on the curve really being quadratic nearby. On **f₁** that gamble paid off reasonably; on **f₃** it missed the valley altogether, highlighting it's trade-off between speed and robustness.

*Fixed‑Step* descent was more accurate, but had a much worse *iteration count* (500 steps on **f₂**!). A fixed stepsize struggles to balance cautiousness and urgency across different situations.

*Backtracking* found the sweet spot. By dialing back the stepsize, whenever the Armijo test failed, it kept the gradient’s sense of direction while having an incredibly low stepsize. The result: same accuracy as fixed‑step in a fraction of the iterations.

### TL:DR?

Every algorithm is a negotiation between prior assumptions and empirical feedback. Quadratic approximation assumes “I know the curvature.” Fixed‑step assumes “One size fits all.” Backtracking adapts iteratively.

---

### Check out some MATLAB

```matlab
% Objective & gradient for f1
f1 = @(t) exp(3*t) + 5*exp(-2*t);
g1 = @(t) 3*exp(3*t) - 10*exp(-2*t);

% Backtracking parameters
s0   = (1 - 0)*0.1;  % 1/10 of bracket width
beta = 0.5;
alpha= 0.5;
[tmin,fmin,ix] = steepline(@(t)deal(f1(t),g1(t)), 0, s0, beta, alpha);
```

---

### Conclusion

In this small‑scale comparison test, **backtracking line search** emerged as the most *balanced* method, since it was accurate, yet economical. **Fixed‑step** is reasonably dependable when runtime is cheap. **Quadratic approximation** is a thrilling sprinter that sometimes dashes the wrong way.

The lesson that I can gain from this is that **context matters**. It's easy to get stuck in a rut with a problem, using one strategy that feels 'normal' even if it's not working. The key is just stepping back. Try coming at it from new angles and you'll feel the trade-offs. One way might be clearer, but exhausting. Another might be easy, but messy. After a while, you stop trying to swim upstream and just let the problem's own shape show you the way to the answer that clicks.

---

### References

1. Antoniou, A., & Lu, W.‑S. (2007). *Practical Optimization*. Springer.
2. Ellis, R. E. *Non‑Linear Data Analytics*