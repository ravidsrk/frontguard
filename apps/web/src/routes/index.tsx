import { createFileRoute } from "@tanstack/react-router";
import { s } from "../lib/style";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { buildSeoHead } from "../lib/seo";
import {
  FRONTGUARD_ORGANIZATION,
  FRONTGUARD_WEBSITE,
  jsonLdScript,
} from "../lib/schema-org";
import { HeroStage } from "../components/home/HeroStage";
import { SignalTelemetryBand } from "../components/home/SignalTelemetryBand";
import { PipelineAndInspector } from "../components/home/PipelineAndInspector";
import { ArchitecturalPillars } from "../components/home/ArchitecturalPillars";
import { WorkflowEntryDeck } from "../components/home/WorkflowEntryDeck";
import { FeatureBentoGrid } from "../components/home/FeatureBentoGrid";
import { ComparisonAndPlugins } from "../components/home/ComparisonAndPlugins";
import { ValidationAndHonesty } from "../components/home/ValidationAndHonesty";
import { ClosingCommandDeck } from "../components/home/ClosingCommandDeck";

const SEO_TITLE = "Frontguard — Catch the regression, not the noise";
const SEO_DESCRIPTION =
  "Open-source visual regression testing with local pixel comparison and optional model-assisted analysis. MIT-licensed CLI.";

const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Frontguard",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Testing Tool",
  operatingSystem: "Linux, macOS, Windows",
  description:
    "Open-source frontend visual regression testing with optional model-assisted review.",
  url: "https://frontguard.dev",
  license: "https://opensource.org/licenses/MIT",
  downloadUrl: "https://www.npmjs.com/package/@frontguard/cli",
  author: {
    "@type": "Person",
    name: "Ravindra Kumar",
    url: "https://github.com/ravidsrk",
  },
  codeRepository: "https://github.com/ravidsrk/frontguard",
  offers: [
    {
      "@type": "Offer",
      name: "Free CLI",
      price: "0",
      priceCurrency: "USD",
      description: "MIT-licensed CLI. Bring your own OpenAI or Anthropic key.",
    },
  ],
};

export const Route = createFileRoute("/")({
  head: () =>
    buildSeoHead({
      title: SEO_TITLE,
      description: SEO_DESCRIPTION,
      path: "/",
      extraMeta: [{ "script:ld+json": SOFTWARE_JSON_LD }],
      scripts: [
        jsonLdScript(FRONTGUARD_ORGANIZATION),
        jsonLdScript(FRONTGUARD_WEBSITE),
      ],
    }),
  component: Home,
});

function Home() {
  return (
    <div
      style={s(
        "min-height: 100vh; background: #0d0c0b; color: #f5f1ea; font-family: 'Space Grotesk', system-ui, sans-serif; -webkit-font-smoothing: antialiased;",
      )}
    >
      <Nav />
      <main id="main-content">
        <HeroStage />
        <SignalTelemetryBand />
        <PipelineAndInspector />
        <ArchitecturalPillars />
        <WorkflowEntryDeck />
        <FeatureBentoGrid />
        <ComparisonAndPlugins />
        <ValidationAndHonesty />
        <ClosingCommandDeck />
      </main>
      <Footer />
    </div>
  );
}
