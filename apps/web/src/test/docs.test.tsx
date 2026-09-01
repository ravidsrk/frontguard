import { act, cleanup, render, screen, within } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "../router";
import {
  articles,
  DOC_SLUGS,
  FIRST_DOC_SLUG,
  navGroups,
} from "../lib/docs-content";

const EXPECTED_NAV_LABELS = [
  "GETTING STARTED",
  "REFERENCE",
  "CI/CD",
  "GUIDES — FEATURES",
  "GUIDES — EXTENDING",
  "GUIDES — MIGRATION",
  "INTEGRATIONS",
  "COMPARISONS",
  "DEPLOYMENT & SANDBOXING",
  "TRUST",
];

async function renderAt(path: string) {
  const router = getRouter();
  await act(async () => {
    await router.navigate({ to: path as "/" });
  });
  const view = render(<RouterProvider router={router} />);
  return { ...view, router };
}

async function renderArticle(slug: string) {
  const router = getRouter();
  await act(async () => {
    await router.navigate({ to: "/docs/$", params: { _splat: slug } });
  });
  const view = render(<RouterProvider router={router} />);
  const article = view.container.querySelector("article");
  return { ...view, article, html: article?.innerHTML ?? "" };
}

function assertHtmlHygiene(html: string, slug: string) {
  expect(html, `${slug}: triple-backtick`).not.toContain("```");
  expect(html, `${slug}: double-backtick`).not.toContain("``");
  expect(html, `${slug}: script`).not.toMatch(/<script/i);
  expect(html, `${slug}: markdown link`).not.toMatch(/\[[^\]]+\]\([^)]+\)/);
  expect(html, `${slug}: raw bold`).not.toMatch(/\*\*[^*]+\*\*/);
  expect(html, `${slug}: nested pre`).not.toMatch(
    /<pre\b[^>]*>(?:(?!<\/pre>)[\s\S])*<pre\b/i,
  );
  expect(html.match(/<pre\b/gi)?.length ?? 0, `${slug}: balanced pre`).toBe(
    html.match(/<\/pre>/gi)?.length ?? 0,
  );
}

function article(id: string) {
  const value = articles.find((candidate) => candidate.id === id);
  expect(value, id).toBeDefined();
  return value!;
}

describe("docs content store", () => {
  it("has all 37 articles with unique ids", () => {
    expect(articles).toHaveLength(37);
    expect(new Set(DOC_SLUGS).size).toBe(37);
  });

  it("exposes nav groups matching the public docs tree", () => {
    const navIds = navGroups.flatMap((group) => group.ids);
    expect(navIds).toHaveLength(37);
    expect(new Set(navIds).size).toBe(37);
    expect(navGroups.map((group) => group.label)).toEqual(EXPECTED_NAV_LABELS);
    for (const slug of DOC_SLUGS) expect(navIds).toContain(slug);
  });

  it("keeps every article body valid and free of raw authoring artifacts", () => {
    for (const value of articles) {
      expect(value.html.length, value.id).toBeGreaterThan(50);
      expect(value.html, value.id).toContain("<h1");
      assertHtmlHygiene(value.html, value.id);
    }
  });

  it("has no broken internal doc links", () => {
    const slugs = new Set(DOC_SLUGS);
    const linkRe = /href="(\/docs\/[^"#?]+)(?:#[^"]*)?"/g;
    for (const value of articles) {
      let match: RegExpExecArray | null;
      while ((match = linkRe.exec(value.html)) !== null) {
        expect(slugs.has(match[1].replace(/^\/docs\//, "")), match[1]).toBe(true);
      }
    }
  });

  it("documents explicit CLI baseline acceptance", () => {
    const quickStart = article("quick-start").html;
    expect(quickStart).toContain("frontguard update-baselines");
    expect(quickStart).toContain("git push origin frontguard-baselines");
    expect(quickStart).toContain("app terminal - leave running");
    expect(quickStart).toContain("generated config baseUrl");
    expect(quickStart).not.toContain("frontguard run --url");
    expect(quickStart.indexOf("frontguard update-baselines")).toBeLessThan(
      quickStart.indexOf("frontguard run"),
    );

    const allHtml = articles.map((value) => value.html).join("\n");
    expect(allHtml).not.toContain("saved automatically");
    expect(allHtml).not.toMatch(/first run captures baselines/i);
    expect(allHtml).not.toMatch(/baselines in one run/i);
    expect(allHtml).not.toMatch(/frontguard baseline(?:\s|<)/);
  });

  it("distinguishes Playwright-package baselines from the CLI contract", () => {
    const playwright = article("playwright/index").html;
    expect(playwright).toContain("visualTest creates a missing baseline");
    expect(playwright).toContain("isNewBaseline: true");
    expect(playwright).toContain("FRONTGUARD_UPDATE=1");
    expect(playwright).not.toContain("expectVisual");
  });

  it("documents threshold units and error-first exit codes", () => {
    const commands = article("cli/commands").html;
    expect(commands).toContain("Changed-pixel ratio (0-1; 0.01 = 1%)");
    expect(commands).toContain("0.05 = 5%");
    expect(commands).toContain("errors take precedence over regressions");
    expect(commands).not.toMatch(/threshold percentage/i);
    expect(commands).not.toMatch(/threshold \(0[-–]100\)/i);
  });

  it("separates the generated workflow from the pre-release composite Action", () => {
    const generated = article("guides/github-actions").html;
    expect(generated).toContain("comparison-only");
    expect(generated).toContain("contents: read");
    expect(generated).toContain("separate explicit workflow");

    const action = article("ci-cd/github-actions").html;
    expect(action).toContain("PRE-RELEASE ACTION");
    expect(action).not.toContain("uses: ravidsrk/frontguard@v0");
    expect(action).toContain("external consumer smoke");
    expect(action).toContain("repo-root action.yml");
    expect(action).toContain("require the workflow to push");
  });

  it("marks every cloud-dependent integration as unavailable by default", () => {
    for (const id of [
      "guides/cloud-api",
      "integrations/mcp",
      "integrations/netlify",
      "integrations/slack",
      "integrations/vercel",
    ]) {
      expect(article(id).html, id).toMatch(/CLOUD API URL REQUIRED|no working hosted default/i);
      expect(article(id).html, id).not.toContain("https://api.frontguard.dev");
    }
  });

  it("keeps marketplace and hosted integration claims explicitly pre-release", () => {
    for (const id of [
      "integrations/netlify",
      "integrations/slack",
      "integrations/vercel",
      "integrations/github",
    ]) {
      expect(article(id).html, id).toMatch(/PRE-RELEASE|not a verified marketplace/i);
      expect(article(id).html, id).not.toMatch(
        /github\.com\/(?:marketplace|apps)\/frontguard|frontguard\/frontguard-action/i,
      );
    }
  });

  it("labels experimental and unvalidated paths without guarantees", () => {
    expect(article("guides/ai-fixes").html).toContain("separate opt-ins");
    expect(article("guides/performance-budgets").html).toContain(
      "not a verified standalone CI gate",
    );
    expect(article("sandbox").html).toContain("not correctness guarantees");
    const renderer = article("cross-os-rendering").html;
    expect(renderer).toContain("NOT VALIDATED");
    expect(renderer).toContain("repository-source-only");
    expect(renderer).toContain("npm pack ./packages/cli");
    expect(renderer).toContain("frontguard-cli.tgz");
    expect(renderer).toContain("docker build --platform linux/amd64");
    expect(renderer).toContain("not yet published");
  });

  it("publishes only the measured validation result", () => {
    const results = article("results").html;
    expect(results).toContain("39 / 43");
    expect(results).toContain("2 / 5");
    expect(results).toContain("AI analysis: disabled");
    expect(results).toContain("one macOS host");
  });

  it("keeps unsupported launch claims out of all article bodies", () => {
    const allHtml = articles.map((value) => value.html).join("\n");
    expect(allHtml).not.toMatch(/expectVisual|DOM \+ computed-style|computed-style diff/i);
    expect(allHtml).not.toMatch(/~40%|73%|<10%|\$100M|\$20B\+|~90%/);
    expect(allHtml).not.toMatch(/only fixes that provably|maps it to the exact code/i);
    expect(allHtml).not.toMatch(/byte-equivalent|most popular|in \d+ minutes/i);
    expect(allHtml).not.toMatch(/Start 14-day trial|Frontguard charges a flat fee/i);
  });
});

describe("docs routes", () => {
  it("uses a responsive navigation layout without a fake search control", async () => {
    const { container } = await renderArticle(FIRST_DOC_SLUG);
    expect(screen.queryByText("Search docs")).not.toBeInTheDocument();
    expect(container.querySelector(".fg-docs-grid")).toBeInTheDocument();
    expect(container.querySelector(".fg-docs-mobile-nav")).toBeInTheDocument();
  });

  it("redirects /docs to the first article", async () => {
    const router = getRouter();
    await act(async () => {
      await router.navigate({ to: "/docs" });
    });
    expect(router.state.location.pathname).toBe(`/docs/${FIRST_DOC_SLUG}`);
  });

  it("renders every article slug with real HTML elements", async () => {
    const router = getRouter();
    await act(async () => {
      await router.navigate({
        to: "/docs/$",
        params: { _splat: DOC_SLUGS[0] },
      });
    });
    const view = render(<RouterProvider router={router} />);
    for (const slug of DOC_SLUGS) {
      await act(async () => {
        await router.navigate({ to: "/docs/$", params: { _splat: slug } });
      });
      const html = view.container.querySelector("article")?.innerHTML ?? "";
      expect(html.length, slug).toBeGreaterThan(50);
      expect(html, slug).toContain("<h1");
      assertHtmlHygiene(html, slug);
    }
    cleanup();
  }, 30000);

  it("renders representative articles", async () => {
    const { html: installHtml } = await renderArticle("installation");
    expect(installHtml).toContain("<pre");
    cleanup();

    const { html: comparisonHtml } = await renderArticle(
      "comparisons/frontguard-vs-argos",
    );
    expect(comparisonHtml).toContain("Argos");
    cleanup();

    const { html: cliHtml } = await renderArticle("cli/commands");
    expect(cliHtml).toContain("Exit codes");
    cleanup();
  });

  it("shows 404 fallback for unknown slug", async () => {
    await renderAt("/docs/this-slug-does-not-exist");
    expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText(/no docs article matches/i)).toBeInTheDocument();
  });

  it("disables prev at the first article and next at the last", async () => {
    const first = articles[0];
    const last = articles[articles.length - 1];

    const { container: firstView } = await renderAt(`/docs/${first.id}`);
    expect(within(firstView).getByText("Overview")).toBeInTheDocument();
    expect(within(firstView).getByText("NEXT →")).toBeInTheDocument();
    expect(
      within(firstView).getByText(articles[1].label, { selector: ".fg-link-title" }),
    ).toBeInTheDocument();

    cleanup();
    const { container: lastView } = await renderAt(`/docs/${last.id}`);
    expect(within(lastView).getByText(/all caught up/i)).toBeInTheDocument();
    expect(
      within(lastView).getByText(articles[articles.length - 2].label, {
        selector: ".fg-link-title",
      }),
    ).toBeInTheDocument();
  });

  it("renders sidebar nav groups from the corrected structure", async () => {
    await renderAt(`/docs/${FIRST_DOC_SLUG}`);
    for (const label of ["GETTING STARTED", "REFERENCE", "CI/CD", "COMPARISONS", "TRUST"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("ON THIS PAGE")).toBeInTheDocument();
  });
});
