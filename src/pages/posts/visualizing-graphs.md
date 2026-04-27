---
layout: ../../layouts/MarkdownPostLayout.astro
title: Visualizing Graphs- Spectral Clustering with Laplacian Matrices and Fiedler Vectors
author: Yash Patel
description: "Data is cool. Graphs are groovy."
image:
    url: "/postphotos/post 2 - edge graphs/Graphs.svg"
    alt: "Figure 1: Left represents the graph in a rectilinear grid, right represents the graph when plotted according to a computed clustering of vertices"
pubDate: 2025-07-20
tags: ["Computer Science"]
showHero: false

song:
  title: "We Don't Wanna Talk"
  artist: "Friday Pilots Club"
---
Graphs are everywhere. From the complex web of social networks, to transportation systems, as these networks grow, interpreting their structure becomes challenging. We can use linear algebra to provide methods to reveal patterns. Let's explore graph representation through Laplacian matrices and spectral clustering using Fiedler vectors, which can provide practical insights into graph analysis.

## Spectral Clustering Essentials

Spectral clustering is a technique that partitions graph nodes into meaningful subsets (clusters) using eigenvalues and eigenvectors derived from special matrices representing the graph.

Two concepts justify support for this approach:

**Adjacency Matrix**: Captures connections between nodes.

**Degree Matrix**: Diagonal matrix where each diagonal entry represents the number of connections a node has.

From these, the **Laplacian Matrix** is calculated:
$L = D - A$

This Laplacian matrix carries significant structural information about the graph.

## Computing the Fiedler Vector

The Fiedler vector is derived from the eigenvectors of the Laplacian matrix. Specifically, it's the eigenvector corresponding to the second smallest eigenvalue. Fun fact, the smallest eigenvalue is always 0, for a connected graph. This vector is pivotal because it reveals the optimal partition of the graph into two clusters.

## Spectral Clustering in MATLAB

Below is the validated MATLAB approach used to analyze our graph:

1: **Construct the Adjacency Matrix**: Symmetric, capturing undirected edges.

2: **Calculate the Degree Matrix**: Sum connections for each node.

3: **Compute the Laplacian Matrix**: `Degree Matrix - Adjacency Matrix`.

4: **Identify the Fiedler Vector**: Second smallest eigenvector from Laplacian.

5: **Cluster Nodes**: Sign-based separation into two sets.

Using a provided edge list, the resulting clustering perfectly matched the expected clusters.

*Here's a little chunk of code that might help you visualize the process in MATLAB:*

```matlab
% Load edge list (Mx2) into variable 'elist'
elist = load('edges.txt'); % Load edge list

% 1) Build adjacency matrix A
n = max(elist(:));
A = zeros(n);
for i = 1:size(elist,1)
    u = elist(i,1);  v = elist(i,2);
    A(u,v) = 1;  A(v,u) = 1;  % undirected
end

% 2) Degree matrix D and Laplacian L
D = diag(sum(A,2));
L = D - A;

% 3) Eigen‐decomposition and Fiedler vector
[V, Λ] = eig(L);
[~, idx] = sort(diag(Λ));
fiedler = V(:, idx(2));  % second smallest eigenvector

% 4) Cluster by sign of Fiedler entries
clusters = ones(n,1);
clusters(fiedler < 0) = -1;

% clusters now contains –1/+1 labels for your two groups
```
*Please note: this block is a watered-down version of my code*

### Results

After running the spectral clustering algorithm, we get the following clusters:

* **Set 1**: Nodes 1, 2, 6, 8, 9, 13, 14, 15, 18, 19
* **Set 2**: Nodes 3, 4, 5, 7, 10, 11, 12, 16, 17, 20

These clusters align exactly with our expected results, affirming the method’s reliability.

### Visualization

Seeing our data in graph form greatly enhances understanding by clearly illustrating the clusters. Our graph on the left places nodes on a Cartesian grid, clearly highlighting edges. The other graph uses circles to distinctly represent clusters, making structural patterns immediately evident. These visualizations show us the capabilities of spectral clustering in extracting meaningful groupings from complex data.

<figure>
    <img src="/postphotos/post 2 - edge graphs/Graphs.svg" alt="" />
    <figcaption>Figure 1: Left represents the graph in a rectilinear grid, right represents the graph when plotted according to a computed clustering of vertices</figcaption>
</figure>


## Discussion and Applications

Spectral clustering, specifically through Laplacian matrices and Fiedler vectors provides an elegant, computationally efficient method for analyzing and partitioning networks.

There are many applications, including:

**Social Networks**: Identifying communities or clusters within social media platforms.
**Transportation Systems**: Optimizing routes and identifying potential bottlenecks.
**Biological Networks**: Understanding protein interactions and genetic pathways.

This exercise lets us illustrate spectral clustering’s versatility and practicality, opening up opportunities for its integration into broader analytical workflows. 