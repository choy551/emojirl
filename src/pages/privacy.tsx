import { Link } from 'wouter';

export default function Privacy() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center py-12 px-4">
      <div className="max-w-prose w-full space-y-6">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </Link>
        </div>

        <h1 className="text-3xl font-black text-primary tracking-tighter">Privacy Policy</h1>
        <p className="text-xs text-muted-foreground">Last updated: June 2026</p>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">No data collected</h2>
          <p className="text-muted-foreground leading-relaxed">
            EmojiRL does not collect, transmit, store remotely, or share any personal data or
            usage information. The game is entirely offline.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Local storage only</h2>
          <p className="text-muted-foreground leading-relaxed">
            All game progress (saves, high scores, settings, emoji discoveries) is stored
            exclusively in your device's local storage. This data never leaves your device
            and is not accessible to us or any third party.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">No third-party services</h2>
          <p className="text-muted-foreground leading-relaxed">
            EmojiRL does not use analytics, advertising networks, crash reporting services,
            or any other third-party SDK that collects data. There are no accounts, logins,
            or cloud saves.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Font files</h2>
          <p className="text-muted-foreground leading-relaxed">
            Fonts are bundled within the app. No external font services or CDNs are contacted
            at runtime.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            Questions? Open an issue on the{' '}
            <a
              href="https://github.com/yourname/emojirl"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub repository
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
