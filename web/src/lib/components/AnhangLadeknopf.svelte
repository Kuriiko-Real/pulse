<!--
  Lade-Knopf für einen Anhang — die eine Stelle für die Speicher-Weiche, die
  vorher wortgleich in drei Komponenten stand (Nachrichten-Anhänge,
  Medienübersicht, Medienarchiv).

  iOS-Hülle: Knopf, der über `dateiTeilenOderLaden` speichert (Teilen-Blatt —
  die WKWebView hat keinen Download-Manager). Überall sonst der Anker von
  vorher. Die Regel selbst steht in `platform/speicherWeg.ts::ladeknopf`.
  Klasse, `aria-label` und `data-testid` reicht der Aufrufer durch.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { dateiTeilenOderLaden } from '$lib/platform/dateiTeilen';
  import { ladeknopf } from '$lib/platform/speicherWeg';
  import { isCapacitorIOS } from '$lib/platform/runtime';

  let {
    quelle,
    dateiname,
    children,
    ...rest
  }: {
    quelle: string | null | undefined;
    dateiname: string | null | undefined;
    children: Snippet;
  } & HTMLAttributes<HTMLElement> = $props();

  const iosHuelle = isCapacitorIOS();
  const lk = $derived(ladeknopf(quelle, dateiname, iosHuelle));
</script>

<svelte:element
  this={lk.tag}
  {...lk.attribute}
  {...rest}
  onclick={lk.tag === 'button'
    ? () => {
        if (quelle) void dateiTeilenOderLaden(quelle, dateiname);
      }
    : undefined}
>
  {@render children()}
</svelte:element>
