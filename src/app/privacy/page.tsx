import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What areyoubetterthan.ai collects, why, who we share it with, and how to exercise your data rights.",
};

const CONTACT_EMAIL = "inquiries@defdev.io";

function H({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 pt-6 text-xl font-semibold tracking-tight">
      <a href={`#${id}`} className="hover:text-human">
        {children}
      </a>
    </h2>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-3 text-muted">
          areyoubetterthan.ai is run by DefDev LLC. This page explains what we collect, why we collect it, who we share it
          with, and what you can ask us to do with it.
        </p>

        <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-faint">
          {[
            ["controller", "Who we are"],
            ["collected", "What we collect"],
            ["cookies", "Cookies & analytics"],
            ["purposes", "Why we use it"],
            ["sharing", "Who we share it with"],
            ["transfers", "International transfers"],
            ["retention", "How long we keep it"],
            ["rights", "Your rights"],
            ["changes", "Changes"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="hover:text-fg">
              {label}
            </a>
          ))}
        </nav>

        <div className="space-y-4 pb-8 text-sm leading-relaxed text-muted">
          <H id="controller">Who we are</H>
          <p>
            The controller of your personal data is DefDev LLC. For privacy questions or requests, contact{" "}
            <a className="text-fg underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>

          <H id="collected">What we collect</H>
          <p>We only collect what the site needs to work. Depending on how you use it, that includes:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-fg">Account data from GitHub sign-in:</strong> your GitHub user id, login, avatar URL,
              and the display name on your GitHub profile. The GitHub access token is used once to read that profile and is
              not stored.
            </li>
            <li>
              <strong className="text-fg">Leaderboard settings:</strong> an optional display name you choose, an optional
              country you select, and whether you are hidden from the leaderboard.
            </li>
            <li>
              <strong className="text-fg">Attempt records:</strong> start and end times, elapsed time, the outcome, the diff
              you submit, and paste sizes and timings. We do not store the contents of pastes.
            </li>
            <li>
              <strong className="text-fg">Scoring results:</strong> the results computed from your attempts, including
              tasks solved and skill estimates.
            </li>
            <li>
              <strong className="text-fg">Shares:</strong> if you create a share page, we store the share and the display
              name you chose for it.
            </li>
          </ul>
          <p>
            Submitted diffs are published in a public GitHub repository and attributed to your GitHub login. Your leaderboard
            entry is public unless you hide it.
          </p>

          <H id="cookies">Cookies &amp; analytics</H>
          <p>We use two cookies, both strictly necessary for signing in:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <code className="text-fg">abt_session</code>: keeps you signed in for up to 30 days.
            </li>
            <li>
              <code className="text-fg">abt_oauth</code>: short-lived (10 minutes), used to check the GitHub sign-in
              response.
            </li>
          </ul>
          <p>
            We do not use advertising or third-party tracking cookies. We use{" "}
            <a className="text-fg underline" href="https://vercel.com/docs/analytics/privacy-policy">
              Vercel Web Analytics
            </a>
            , which is cookieless. It records page URLs, referrers, approximate location, device and browser information, and
            does not identify you across sites. Visitor sessions are discarded after 24 hours.
          </p>

          <H id="purposes">Why we use it</H>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-fg">To run the game:</strong> sign-in, recording and scoring your attempts, and
              showing your results. This is needed to provide the service you ask for.
            </li>
            <li>
              <strong className="text-fg">To show the public leaderboard:</strong> your leaderboard entry is published by
              default once you have a scored attempt. You can change it to a display name or hide it at any time in My
              results.
            </li>
            <li>
              <strong className="text-fg">To keep the site working and understand traffic:</strong> aggregate page-view
              analytics and security and abuse prevention.
            </li>
          </ul>
          <p>We do not sell your personal data, and we do not use it for advertising.</p>

          <H id="sharing">Who we share it with</H>
          <p>We use these service providers to run the site. They process data on our behalf:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-fg">GitHub:</strong> sign-in, the public submissions repository, and avatar images
              served from GitHub&apos;s content delivery network.
            </li>
            <li>
              <strong className="text-fg">Vercel:</strong> website hosting and Web Analytics.
            </li>
            <li>
              <strong className="text-fg">Neon:</strong> the database that stores account, attempt, and scoring data.
            </li>
            <li>
              <strong className="text-fg">jsDelivr:</strong> serves the code editor library in the browser, so your IP
              address is sent to it when the editor loads.
            </li>
          </ul>
          <p>
            Anyone can see your leaderboard entry and any diffs you submit, as described above. We may disclose information
            if the law requires it.
          </p>

          <H id="transfers">International transfers</H>
          <p>
            Our providers operate globally, so your data may be processed outside your country, including in the United
            States. Where required, we rely on the safeguards those providers offer for such transfers. If you would like
            details about a specific provider, contact us.
          </p>

          <H id="retention">How long we keep it</H>
          <p>
            Account, attempt, and scoring data is kept while your account exists. Session cookies expire as described above,
            and analytics sessions are discarded after 24 hours. Diffs that have already been published to the public
            submissions repository remain in its history unless we remove them. We have not yet set a fixed retention period
            for other data. We will publish one here when we do.
          </p>

          <H id="rights">Your rights</H>
          <p>Depending on where you live, including under the EU and UK GDPR, you can ask us to:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>give you a copy of the personal data we hold about you;</li>
            <li>correct inaccurate data;</li>
            <li>delete your data;</li>
            <li>restrict or object to some processing;</li>
            <li>withdraw consent where we rely on it, without affecting earlier processing.</li>
          </ul>
          <p>
            To make a request, email{" "}
            <a className="text-fg underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . You can hide your leaderboard entry yourself in My results at any time. We will respond within one month. You
            also have the right to lodge a complaint with your local data protection authority.
          </p>

          <H id="changes">Changes</H>
          <p>
            We may update this page. If we make a material change, we will say so on this page before it takes effect.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
