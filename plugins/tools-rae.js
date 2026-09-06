import { load } from "cheerio";
import { pedirHttp } from "../lib/http.js";

const SUP_MAP = {
  0: "⁰",
  1: "¹",
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; script/1.0; +https://asd.com)",
  "Accept-Language": "es-ES,es;q=0.9",
};

async function fetch_page(word) {
  const url = `https://dle.rae.es/${encodeURIComponent(word)}`;
  try {
    // La RAE está detrás de Cloudflare y le responde 403 al fetch nativo; con el cliente del core de Node contesta bien.
    const resp = await pedirHttp(url, { headers: HEADERS, timeoutMs: 10000 });
    return { resp, url };
  } catch (e) {
    console.error(`Error de conexión: ${e}`);
    return { resp: null, url };
  }
}

function clean_element_of_related($, el) {
  if (!el || el.length === 0) return;

  const cls_pats = [/c-definitions__item-footer/i, /c-word-list/i, /c-related/i, /c-synonyms/i, /c-anchors/i, /c-sponsor/i, /related/i, /see-?also/i, /otras|similares|vincul/i, /sin/i, /sinonimos/i, /k5/i];

  const toRemove = [];
  el.find("*").each((i, node) => {
    const classAttr = $(node).attr("class");
    if (classAttr) {
      const classes = classAttr.split(/\s+/);
      for (const cls of classes) {
        for (const pat of cls_pats) {
          if (pat.test(cls)) {
            toRemove.push(node);
            return;
          }
        }
      }
    }
  });
  toRemove.forEach((node) => $(node).remove());

  const listsToRemove = [];
  el.find("ul, ol, nav, aside").each((i, lst) => {
    const $lst = $(lst);
    const anchors = $lst.find("a");
    if (anchors.length === 0) return;
    const total_text = $lst.text().replace(/\s+/g, " ").trim();
    if (!total_text) {
      listsToRemove.push(lst);
      return;
    }
    const anchor_text_len = Array.from(anchors).reduce((sum, a) => sum + $(a).text().replace(/\s+/g, " ").trim().length, 0);
    if (anchor_text_len / total_text.length > 0.5 || anchors.length >= 3) {
      listsToRemove.push(lst);
    }
  });
  listsToRemove.forEach((lst) => $(lst).remove());
}

function extract_definitions_from_articles(html) {
  const $ = load(html);

  let articles = $('article[role="main"]');
  if (articles.length === 0) {
    articles = $("article");
    if (articles.length === 0) {
      articles = $("#resultados");
      if (articles.length === 0) return null;
    }
  }

  const all_parts = [];

  articles.each((idx, article) => {
    const $article = $(article);
    $article.find("script, style").remove();

    const title = $article.find("h1.c-page-header__title").text().trim();
    if (title) {
      const titleWithSup = title.replace(/(\d+)$/, (m, digits) => digitsToSup(digits));
      all_parts.push(`👉 ${titleWithSup}`);
    }

    const parts = [];

    const intro_selector = '[class*="c-text-intro"], [class*="n2"], [class*="c-section__title"], [class*="c-page-header__title"], [class*="etimologia"]';
    const intro = $article.find(intro_selector).first();
    if (intro.length && intro.attr("class") && (intro.attr("class").includes("c-text-intro") || intro.attr("class").includes("etimologia") || intro.attr("class").includes("n2"))) {
      const intro_text = intro.text().replace(/\s+/g, " ").trim();
      if (intro_text) {
        const prefix = intro_text.toLowerCase().startsWith("del") ? "" : "Del: ";
        parts.push(prefix + intro_text);
      }
    }

    const defs_ol = $article.find('ol[class*="definitions"]').first();
    if (defs_ol.length) {
      const definitions = [];
      defs_ol.children("li").each((i, li) => {
        const $li = $(li);
        const $item = $li.find(".c-definitions__item").length ? $li.find(".c-definitions__item") : $li;
        clean_element_of_related($, $item);

        const subToRemove = [];
        $item.find("p, span, div").each((j, sub) => {
          const $sub = $(sub);
          const sub_text = $sub.text().replace(/\s+/g, " ").trim();
          if (/^sin[:.]|^ant[:.]/i.test(sub_text)) {
            subToRemove.push(sub);
          }
        });
        subToRemove.forEach((sub) => $(sub).remove());

        const text = $item.text().replace(/\s+/g, " ").trim();
        if (text) definitions.push(text);
      });
      if (definitions.length) {
        parts.push(definitions.join("\n\n"));
      }
    } else {
      const h1 = $article.find("h1");
      const start = h1.length ? h1.parent() : $article;
      const collected = [];
      const stop_patterns = /(sin[oó]nim|antonim|sin\.|ant\.|relacionad|otras locuciones|véase|véase también)/i;

      let sib = start.next();
      while (sib.length) {
        const txt = sib.text().replace(/\s+/g, " ").trim();
        if (!txt) {
          sib = sib.next();
          continue;
        }
        if (stop_patterns.test(txt)) break;

        if (sib.attr("class") && /c-word-list|c-related|c-sponsor|c-anchors/i.test(sib.attr("class"))) {
          sib = sib.next();
          continue;
        }

        const anchors = sib.find("a");
        if (anchors.length) {
          const total_text = txt;
          const anchor_text_len = Array.from(anchors).reduce((sum, a) => sum + $(a).text().replace(/\s+/g, " ").trim().length, 0);
          if (anchor_text_len / total_text.length > 0.6 || anchors.length >= 3) {
            sib = sib.next();
            continue;
          }
        }

        collected.push(txt);
        sib = sib.next();
      }

      if (collected.length) {
        parts.push(collected.join("\n"));
      }
    }

    if (parts.length) {
      all_parts.push(parts.join("\n").trim());
    }
    all_parts.push("");
  });

  if (all_parts.length) {
    return all_parts.join("\n").trim();
  }
  return null;
}

const plugin = {};
plugin.cmd = ["definición", "rae", "definicion"];
plugin.botAdmin = true;

plugin.run = async (m, { client, args, usedPrefix, command }) => {
  if (!args || !args.length) return client.sendText(m.chat, `Ingrese una palabra para buscar la definición.\n\nEjemplo: ${usedPrefix}${command} auto`, m);

  const { resp } = await fetch_page(args[0]);
  if (!resp || resp.status !== 200) return client.sendText(m.chat, "No se pudo obtener las definiciones.", m);

  const html = await resp.text();
  const resultado = extract_definitions_from_articles(html);
  if (resultado) {
    client.sendText(m.chat, `📚 Definiciones RAE de "${args[0]}"\n\n${resultado}`, m);
  } else {
    client.sendText(m.chat, "No se pudo obtener las definiciones. La estructura de la página pudo cambiar o la palabra no existe en la RAE.", m);
  }
};

export default plugin;

function digitsToSup(digits) {
  return digits
    .split("")
    .map((d) => SUP_MAP[d] || d)
    .join("");
}
