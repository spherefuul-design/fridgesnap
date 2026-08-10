"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Camera, X, ChevronRight, ChevronLeft, Check, Loader2, Clock, Users, ArrowLeft, RotateCcw, ChefHat, Sparkles, ShoppingBasket, Flame } from "lucide-react";

const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');";

const COLORS = {
  cream: "#FAF6F0",
  creamDark: "#F1E9DC",
  terracotta: "#D4653A",
  terracottaDark: "#B14F29",
  ink: "#3A2E26",
  sage: "#7C8A64",
  sageDark: "#5F6B4B",
  muted: "#A89A8C",
  line: "#E4D9C8",
};

const HINTS = [
  "Сфотографуй холодильник",
  "Або шафу з крупами",
  "Або просто продукти на столі",
  "Двері, полиці, морозилка — все підійде",
];

const LOADING_LINES = [
  "Роздивляюсь полиці…",
  "Рахую яйця…",
  "Шукаю, що зникло в глибині холодильника…",
  "Розпізнаю продукти…",
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(",")[1];
      resolve({ base64, mediaType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function extractJson(text) {
  if (!text) throw new Error("empty response");
  let cleaned = text.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const candidate = objMatch ? objMatch[0] : arrMatch ? arrMatch[0] : null;
    if (candidate) return JSON.parse(candidate);
    throw e;
  }
}

async function callClaude(messages, maxTokens = 1000) {
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      maxTokens,
    }),
  });
  if (!response.ok) throw new Error("api error " + response.status);
  const data = await response.json();
  const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
  return text;
}

export default function FridgeSnapApp() {
  const [screen, setScreen] = useState("onboarding");
  const [obStep, setObStep] = useState(-1);
  const [prefs, setPrefs] = useState({ diet: null, time: null, allergies: [] });
  const [hintIndex, setHintIndex] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [scanPhase, setScanPhase] = useState("");
  const [scanError, setScanError] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [cookIndex, setCookIndex] = useState(0);
  const [history, setHistory] = useState([]);
  const [timerSeconds, setTimerSeconds] = useState(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setHintIndex((i) => (i + 1) % HINTS.length), 2600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      setTimerSeconds((s) => {
        if (s === null) return s;
        if (s <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  const resetTimerForStep = (step) => {
    setTimerRunning(false);
    setTimerSeconds(step && step.timerSeconds ? step.timerSeconds : null);
  };

  const handlePickPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    if (files.length === 0) return;
    try {
      const encoded = await Promise.all(files.map(fileToBase64));
      setPhotos(encoded);
      setScreen("scanning");
      runRecognition(encoded);
    } catch (err) {
      setScanError("Не вдалось прочитати фото. Спробуй ще раз.");
    }
    e.target.value = "";
  };

  const runRecognition = useCallback(async (encoded) => {
    setScanError(null);
    setScanPhase("loading");
    const start = Date.now();
    try {
      const imageBlocks = encoded.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      }));
      const prompt = {
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text:
              "Ти дивишся на фото вмісту холодильника, шафи або продуктів на столі. " +
              "Перелічи всі їстівні продукти та інгредієнти, які бачиш українською мовою. " +
              "Групуй розумно (наприклад просто «яйця», а не кожне яйце окремо). " +
              "Не вигадуй продукти, яких не видно. " +
              "Поверни ЛИШЕ валідний JSON-масив рядків, без пояснень, без markdown, без коду. " +
              'Приклад формату: ["яйця","молоко","цибуля","сир"]',
          },
        ],
      };
      const text = await callClaude([prompt]);
      const list = extractJson(text);
      const cleanList = Array.isArray(list) ? list.filter((x) => typeof x === "string" && x.trim()) : [];
      const elapsed = Date.now() - start;
      const minDelay = 1800;
      if (elapsed < minDelay) await new Promise((r) => setTimeout(r, minDelay - elapsed));
      if (cleanList.length === 0) {
        setScanError("Не вдалось розпізнати продукти на фото. Спробуй фото при кращому світлі.");
        setScanPhase("");
        return;
      }
      setIngredients(cleanList.map((name, i) => ({ id: `${i}-${name}`, name })));
      setScreen("ingredients");
      setScanPhase("");
    } catch (err) {
      setScanError("Щось пішло не так під час розпізнавання. Спробуй ще раз.");
      setScanPhase("");
    }
  }, []);

  const removeIngredient = (id) => {
    setIngredients((list) => list.filter((i) => i.id !== id));
  };

  const generateRecipes = async () => {
    setRecipesError(null);
    setRecipesLoading(true);
    try {
      const dietLabel = prefs.diet === "no" ? "не їсть м'ясо (вегетаріанець)" : prefs.diet === "sometimes" ? "їсть м'ясо іноді, краще легкі варіанти" : "їсть все, включно з м'ясом";
      const timeLabel = prefs.time === "15" ? "максимум 15 хвилин" : prefs.time === "30" ? "максимум 30 хвилин" : "часу достатньо, не поспішає";
      const allergyLabel = prefs.allergies.length ? prefs.allergies.join(", ") : "немає";
      const historyLabel = history.length ? history.join(", ") : "немає";
      const ingredientNames = ingredients.map((i) => i.name);
      const prompt = {
        role: "user",
        content:
          "Ти генератор рецептів для застосунку FridgeSnap. У користувача вдома є ці продукти: " +
          JSON.stringify(ingredientNames) +
          `. Уподобання: ${dietLabel}. Часу на готування: ${timeLabel}. Алергії/обмеження: ${allergyLabel}. ` +
          `Вже готував нещодавно (не повторюй ці страви): ${historyLabel}. ` +
          "Вважай, що ці базові продукти є вдома завжди, незалежно від фото: сіль, чорний перець, олія, цукор, вода, борошно, часник, цибуля. " +
          "НЕ додавай жоден з них у списки \"have\" чи \"need\" — просто вільно використовуй у кроках приготування без згадки як про докупівлю. " +
          "Запропонуй РІВНО 3 рецепти, які реалістично можна приготувати переважно з наявних продуктів (можна докупити не більше 2 дрібниць на рецепт, і це не мають бути сіль/перець/олія/цукор/вода/борошно/часник/цибуля — лише щось дійсно відсутнє). " +
          "Рецепт 1 має бути найшвидший (label: \"Найшвидше\"), рецепт 2 — найситніший повноцінний прийом їжі (label: \"Найситніше\"), рецепт 3 — несподівана, цікава комбінація (label: \"Несподівано\"). " +
          "Кожен рецепт: до 5 коротких кроків приготування, кожен опис кроку до 15 слів. Будь дуже стислим. " +
          "Поверни ЛИШЕ валідний JSON без markdown, точно за такою схемою: " +
          '{"recipes":[{"title":"","emoji":"","cookTime":"15 хв","label":"Найшвидше","servings":2,"have":["",""],"need":["сіль"],"description":"одне речення","steps":[{"title":"","description":"","timerSeconds":0}]}]}. ' +
          "Все українською мовою. emoji — один емодзі страви.",
      };
      const text = await callClaude([prompt], 3000);
      const data = extractJson(text);
      const list = Array.isArray(data?.recipes) ? data.recipes : [];
      if (list.length === 0) throw new Error("empty recipes");
      setRecipes(list);
      setScreen("recipes");
    } catch (err) {
      setRecipesError("Не вдалось підібрати рецепти. Спробуй ще раз.");
    } finally {
      setRecipesLoading(false);
    }
  };

  const openRecipe = (r) => {
    setSelectedRecipe(r);
    setScreen("recipe-detail");
  };

  const startCooking = () => {
    setCookIndex(0);
    resetTimerForStep(selectedRecipe?.steps?.[0]);
    setScreen("cooking");
  };

  const goToStep = (idx) => {
    const steps = selectedRecipe?.steps || [];
    if (idx < 0 || idx >= steps.length) return;
    setCookIndex(idx);
    resetTimerForStep(steps[idx]);
  };

  const finishCooking = () => {
    if (selectedRecipe) setHistory((h) => [selectedRecipe.title, ...h].slice(0, 8));
    setScreen("home");
    setSelectedRecipe(null);
    setPhotos([]);
    setIngredients([]);
    setRecipes([]);
  };

  const startOver = () => {
    setPhotos([]);
    setIngredients([]);
    setRecipes([]);
    setScanError(null);
    setRecipesError(null);
    setScreen("home");
  };

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        background: COLORS.cream,
        color: COLORS.ink,
        minHeight: "600px",
        width: "100%",
        maxWidth: "420px",
        margin: "0 auto",
        borderRadius: "28px",
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 1px 0 rgba(58,46,38,0.08)",
        border: `1px solid ${COLORS.line}`,
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        ${FONT_IMPORT}
        .fs-display { font-family: 'Fraunces', serif; }
        .fs-scroll::-webkit-scrollbar { display: none; }
        .fs-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fsFlyIn {
          0% { opacity: 0; transform: translateY(14px) scale(0.85) rotate(-4deg); }
          60% { opacity: 1; }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
        }
        @keyframes fsBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.035); }
        }
        @keyframes fsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fsFadeUp {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .fs-chip { animation: fsFlyIn 0.45s cubic-bezier(.2,.8,.3,1) both; }
        .fs-fade { animation: fsFadeUp 0.35s ease both; }
        .fs-cam-btn { animation: fsBreathe 3.4s ease-in-out infinite; }
        .fs-spin { animation: fsSpin 1s linear infinite; }
        input[type="file"].fs-hidden-input {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `,
        }}
      />

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} className="fs-hidden-input" tabIndex={-1} aria-hidden="true" />

      {screen === "onboarding" && (
        <Onboarding
          step={obStep}
          setStep={setObStep}
          prefs={prefs}
          setPrefs={setPrefs}
          onDone={() => setScreen("home")}
        />
      )}

      {screen === "home" && (
        <HomeScreen hint={HINTS[hintIndex]} onPhoto={handlePickPhoto} history={history} />
      )}

      {screen === "scanning" && (
        <ScanningScreen photo={photos[0]} error={scanError} onRetry={() => runRecognition(photos)} onCancel={startOver} />
      )}

      {screen === "ingredients" && (
        <IngredientsScreen
          ingredients={ingredients}
          onRemove={removeIngredient}
          onConfirm={generateRecipes}
          loading={recipesLoading}
          error={recipesError}
          onBack={startOver}
        />
      )}

      {screen === "recipes" && (
        <RecipesScreen recipes={recipes} onOpen={openRecipe} onBack={() => setScreen("ingredients")} onRescan={startOver} />
      )}

      {screen === "recipe-detail" && selectedRecipe && (
        <RecipeDetail recipe={selectedRecipe} onBack={() => setScreen("recipes")} onCook={startCooking} />
      )}

      {screen === "cooking" && selectedRecipe && (
        <CookingScreen
          recipe={selectedRecipe}
          index={cookIndex}
          onNext={() => goToStep(cookIndex + 1)}
          onPrev={() => goToStep(cookIndex - 1)}
          onExit={() => setScreen("recipe-detail")}
          onFinish={finishCooking}
          timerSeconds={timerSeconds}
          timerRunning={timerRunning}
          toggleTimer={() => setTimerRunning((r) => !r)}
        />
      )}
    </div>
  );
}

function TapOption({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 18px",
        borderRadius: "14px",
        border: `1.5px solid ${active ? COLORS.terracotta : COLORS.line}`,
        background: active ? COLORS.terracotta : "#fff",
        color: active ? "#fff" : COLORS.ink,
        fontFamily: "'Inter', sans-serif",
        fontWeight: 500,
        fontSize: "14.5px",
        cursor: "pointer",
        transition: "all 0.15s ease",
        margin: "5px",
      }}
    >
      {label}
    </button>
  );
}

function Onboarding({ step, setStep, prefs, setPrefs, onDone }) {
  const steps = [
    {
      key: "diet",
      question: "Ти їси м'ясо?",
      options: [
        { label: "Так", value: "yes" },
        { label: "Іноді", value: "sometimes" },
        { label: "Ні", value: "no" },
      ],
      onPick: (v) => setPrefs((p) => ({ ...p, diet: v })),
      value: prefs.diet,
    },
    {
      key: "time",
      question: "Скільки часу є на готування?",
      options: [
        { label: "15 хв", value: "15" },
        { label: "30 хв", value: "30" },
        { label: "Не поспішаю", value: "any" },
      ],
      onPick: (v) => setPrefs((p) => ({ ...p, time: v })),
      value: prefs.time,
    },
    {
      key: "allergies",
      question: "Алергії чи обмеження?",
      multi: true,
      options: [
        { label: "Горіхи", value: "горіхи" },
        { label: "Лактоза", value: "лактоза" },
        { label: "Глютен", value: "глютен" },
        { label: "Немає", value: "none" },
      ],
      onPick: (v) =>
        setPrefs((p) => {
          if (v === "none") return { ...p, allergies: [] };
          const has = p.allergies.includes(v);
          return { ...p, allergies: has ? p.allergies.filter((x) => x !== v) : [...p.allergies, v] };
        }),
      value: prefs.allergies,
    },
  ];

  if (step === -1) {
    return (
      <div style={{ padding: "40px 28px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "600px", textAlign: "center" }}>
        <div
          style={{
            width: "84px",
            height: "84px",
            borderRadius: "24px",
            background: COLORS.terracotta,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "28px",
          }}
        >
          <Camera size={38} color="#fff" strokeWidth={1.6} />
        </div>
        <h1 className="fs-display" style={{ fontSize: "30px", fontWeight: 600, lineHeight: 1.15, margin: "0 0 14px" }}>
          Сфотографуй холодильник —<br />отримай 3 рецепти за 10 секунд
        </h1>
        <p style={{ color: COLORS.muted, fontSize: "15px", lineHeight: 1.5, margin: "0 0 40px", maxWidth: "300px" }}>
          Ані списків покупок, ані годин скролінгу. Тільки те, що вже є вдома.
        </p>
        <button
          onClick={() => setStep(0)}
          style={{
            background: COLORS.terracotta,
            color: "#fff",
            border: "none",
            borderRadius: "16px",
            padding: "16px 36px",
            fontSize: "16px",
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          Почати <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  const s = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fs-fade" style={{ padding: "36px 26px", display: "flex", flexDirection: "column", minHeight: "600px" }}>
      <div style={{ display: "flex", gap: "6px", marginBottom: "48px" }}>
        {steps.map((_, i) => (
          <div key={i} style={{ height: "4px", flex: 1, borderRadius: "2px", background: i <= step ? COLORS.terracotta : COLORS.line }} />
        ))}
      </div>
      <h2 className="fs-display" style={{ fontSize: "26px", fontWeight: 600, margin: "0 0 24px" }}>{s.question}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", marginLeft: "-5px" }}>
        {s.options.map((o) => {
          const active = s.multi ? (o.value === "none" ? s.value.length === 0 : s.value.includes(o.value)) : s.value === o.value;
          return <TapOption key={o.value} label={o.label} active={active} onClick={() => s.onPick(o.value)} />;
        })}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)} style={{ background: "none", border: "none", color: COLORS.muted, fontSize: "14px", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
            Назад
          </button>
        ) : <span />}
        <button
          onClick={() => (isLast ? onDone() : setStep(step + 1))}
          style={{
            background: COLORS.terracotta,
            color: "#fff",
            border: "none",
            borderRadius: "14px",
            padding: "13px 28px",
            fontSize: "15px",
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {isLast ? "Готово" : "Далі"} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function HomeScreen({ hint, onPhoto, history }) {
  return (
    <div style={{ minHeight: "600px", display: "flex", flexDirection: "column", padding: "28px 24px" }}>
      <div style={{ textAlign: "center", marginTop: "6px", marginBottom: "6px" }}>
        <span className="fs-display" style={{ fontSize: "17px", fontWeight: 600, color: COLORS.terracotta }}>FridgeSnap</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <button
          onClick={onPhoto}
          className="fs-cam-btn"
          style={{
            width: "190px",
            height: "190px",
            borderRadius: "50%",
            background: COLORS.terracotta,
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 12px 30px rgba(212,101,58,0.28)",
          }}
        >
          <Camera size={64} color="#fff" strokeWidth={1.4} />
        </button>
        <p key={hint} className="fs-fade" style={{ marginTop: "26px", fontSize: "15.5px", color: COLORS.ink, fontWeight: 500, textAlign: "center", minHeight: "22px" }}>
          {hint}
        </p>
      </div>
      {history.length > 0 && (
        <div style={{ paddingBottom: "6px" }}>
          <p style={{ fontSize: "12.5px", color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 10px" }}>
            Твої останні рецепти
          </p>
          <div className="fs-scroll" style={{ display: "flex", gap: "10px", overflowX: "auto" }}>
            {history.map((h, i) => (
              <div
                key={i}
                style={{
                  flexShrink: 0,
                  background: "#fff",
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: "12px",
                  padding: "10px 14px",
                  fontSize: "13.5px",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScanningScreen({ photo, error, onRetry, onCancel }) {
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLineIdx((i) => (i + 1) % LOADING_LINES.length), 1400);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <div style={{ minHeight: "600px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", textAlign: "center" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "18px", background: COLORS.creamDark, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
          <X size={28} color={COLORS.terracotta} />
        </div>
        <p className="fs-display" style={{ fontSize: "19px", fontWeight: 600, margin: "0 0 8px" }}>Не вийшло розпізнати</p>
        <p style={{ color: COLORS.muted, fontSize: "14px", margin: "0 0 28px", lineHeight: 1.5 }}>{error}</p>
        <button onClick={onRetry} style={btnPrimary}>Спробувати ще раз</button>
        <button onClick={onCancel} style={{ ...btnGhost, marginTop: "10px" }}>Інше фото</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "600px", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px", overflow: "hidden" }}>
      {photo && (
        <img
          src={`data:${photo.mediaType};base64,${photo.base64}`}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.16, filter: "blur(1px)" }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "50%", border: `3px solid ${COLORS.line}`, borderTopColor: COLORS.terracotta, marginBottom: "22px" }} className="fs-spin" />
        <p key={lineIdx} className="fs-fade fs-display" style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>{LOADING_LINES[lineIdx]}</p>
        <div style={{ display: "flex", gap: "8px", marginTop: "26px", flexWrap: "wrap", justifyContent: "center", maxWidth: "280px" }}>
          {["🥚", "🥛", "🧅", "🧀", "🥕"].map((e, i) => (
            <span
              key={i}
              className="fs-chip"
              style={{
                animationDelay: `${i * 0.15}s`,
                fontSize: "22px",
                background: "#fff",
                border: `1px solid ${COLORS.line}`,
                borderRadius: "12px",
                width: "42px",
                height: "42px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {e}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function IngredientsScreen({ ingredients, onRemove, onConfirm, loading, error, onBack }) {
  return (
    <div style={{ minHeight: "600px", display: "flex", flexDirection: "column", padding: "24px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: "6px" }}>
        <button onClick={onBack} style={iconBtn}><ArrowLeft size={19} /></button>
      </div>
      <h2 className="fs-display" style={{ fontSize: "22px", fontWeight: 600, margin: "10px 0 4px" }}>Ось що я побачив</h2>
      <p style={{ color: COLORS.muted, fontSize: "14px", margin: "0 0 20px" }}>Прибери зайве, якщо щось не так</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "9px", marginBottom: "24px" }}>
        {ingredients.map((ing, i) => (
          <span
            key={ing.id}
            className="fs-chip"
            style={{
              animationDelay: `${i * 0.05}s`,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "#fff",
              border: `1px solid ${COLORS.line}`,
              borderRadius: "20px",
              padding: "9px 10px 9px 16px",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            {ing.name}
            <button
              onClick={() => onRemove(ing.id)}
              aria-label={`Прибрати ${ing.name}`}
              style={{ background: COLORS.creamDark, border: "none", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <X size={12} color={COLORS.ink} />
            </button>
          </span>
        ))}
        {ingredients.length === 0 && (
          <p style={{ color: COLORS.muted, fontSize: "14px" }}>Нічого не залишилось — сфотографуй ще раз.</p>
        )}
      </div>

      {error && <p style={{ color: COLORS.terracottaDark, fontSize: "13.5px", marginBottom: "12px" }}>{error}</p>}

      <div style={{ flex: 1 }} />
      <button
        onClick={onConfirm}
        disabled={loading || ingredients.length === 0}
        style={{
          ...btnPrimary,
          width: "100%",
          opacity: loading || ingredients.length === 0 ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        {loading ? (
          <>
            <Loader2 size={17} className="fs-spin" /> Підбираю рецепти…
          </>
        ) : (
          <>Знайти рецепти <ChevronRight size={17} /></>
        )}
      </button>
    </div>
  );
}

function RecipesScreen({ recipes, onOpen, onBack, onRescan }) {
  return (
    <div style={{ minHeight: "600px", display: "flex", flexDirection: "column", padding: "24px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", marginBottom: "18px" }}>
        <button onClick={onBack} style={iconBtn}><ArrowLeft size={19} /></button>
        <button onClick={onRescan} style={{ ...iconBtn, display: "flex", alignItems: "center", gap: "6px", width: "auto", padding: "0 12px", fontSize: "13px", fontWeight: 500, color: COLORS.muted }}>
          <RotateCcw size={15} /> Нове фото
        </button>
      </div>
      <h2 className="fs-display" style={{ fontSize: "22px", fontWeight: 600, margin: "0 0 4px", padding: "0 22px" }}>Твої 3 варіанти</h2>
      <p style={{ color: COLORS.muted, fontSize: "14px", margin: "0 0 18px", padding: "0 22px" }}>Гортай і обирай</p>

      <div className="fs-scroll" style={{ display: "flex", overflowX: "auto", gap: "16px", padding: "4px 22px 12px", scrollSnapType: "x mandatory" }}>
        {recipes.map((r, i) => (
          <RecipeCard key={i} recipe={r} onOpen={() => onOpen(r)} />
        ))}
      </div>
    </div>
  );
}

const labelColor = (label) => {
  if (label === "Найшвидше") return COLORS.terracotta;
  if (label === "Найситніше") return COLORS.sage;
  return "#8B6FAE";
};

function RecipeCard({ recipe, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        flexShrink: 0,
        width: "78%",
        minWidth: "230px",
        scrollSnapAlign: "center",
        background: "#fff",
        border: `1px solid ${COLORS.line}`,
        borderRadius: "20px",
        padding: "22px 20px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <span
        style={{
          alignSelf: "flex-start",
          fontSize: "11.5px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: labelColor(recipe.label),
          background: `${labelColor(recipe.label)}1A`,
          padding: "5px 10px",
          borderRadius: "8px",
          marginBottom: "14px",
        }}
      >
        {recipe.label}
      </span>
      <span style={{ fontSize: "38px", marginBottom: "10px" }}>{recipe.emoji || "🍽️"}</span>
      <h3 className="fs-display" style={{ fontSize: "19px", fontWeight: 600, margin: "0 0 8px", lineHeight: 1.2 }}>{recipe.title}</h3>
      <p style={{ fontSize: "13.5px", color: COLORS.muted, margin: "0 0 16px", lineHeight: 1.45 }}>{recipe.description}</p>
      <div style={{ display: "flex", gap: "14px", fontSize: "12.5px", color: COLORS.ink, fontWeight: 500 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><Clock size={14} color={COLORS.muted} /> {recipe.cookTime}</span>
        {recipe.servings && <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><Users size={14} color={COLORS.muted} /> {recipe.servings}</span>}
      </div>
      {recipe.need && recipe.need.length > 0 && (
        <p style={{ fontSize: "12px", color: COLORS.muted, marginTop: "12px", marginBottom: 0 }}>
          + докупи: {recipe.need.join(", ")}
        </p>
      )}
    </button>
  );
}

function RecipeDetail({ recipe, onBack, onCook }) {
  return (
    <div style={{ minHeight: "600px", display: "flex", flexDirection: "column", padding: "24px 22px" }}>
      <button onClick={onBack} style={iconBtn}><ArrowLeft size={19} /></button>

      <div style={{ textAlign: "center", margin: "12px 0 6px" }}>
        <span style={{ fontSize: "48px" }}>{recipe.emoji || "🍽️"}</span>
      </div>
      <span
        style={{
          alignSelf: "center",
          margin: "0 auto 10px",
          fontSize: "11.5px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: labelColor(recipe.label),
          background: `${labelColor(recipe.label)}1A`,
          padding: "5px 10px",
          borderRadius: "8px",
        }}
      >
        {recipe.label}
      </span>
      <h2 className="fs-display" style={{ fontSize: "24px", fontWeight: 600, textAlign: "center", margin: "6px 0 8px" }}>{recipe.title}</h2>
      <p style={{ textAlign: "center", color: COLORS.muted, fontSize: "14px", margin: "0 0 18px", lineHeight: 1.5 }}>{recipe.description}</p>

      <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginBottom: "22px", fontSize: "13.5px", fontWeight: 500 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Clock size={15} color={COLORS.terracotta} /> {recipe.cookTime}</span>
        {recipe.servings && <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Users size={15} color={COLORS.terracotta} /> {recipe.servings} порції</span>}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: "16px", padding: "16px 18px", marginBottom: "16px" }}>
        <p style={{ fontSize: "12.5px", fontWeight: 700, color: COLORS.sageDark, textTransform: "uppercase", letterSpacing: "0.03em", margin: "0 0 10px" }}>З твого фото</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
          {(recipe.have || []).map((h, i) => (
            <span key={i} style={{ fontSize: "13px", background: `${COLORS.sage}1A`, color: COLORS.sageDark, padding: "5px 11px", borderRadius: "10px", fontWeight: 500 }}>
              {h}
            </span>
          ))}
        </div>
        {recipe.need && recipe.need.length > 0 && (
          <>
            <p style={{ fontSize: "12.5px", fontWeight: 700, color: COLORS.terracottaDark, textTransform: "uppercase", letterSpacing: "0.03em", margin: "16px 0 10px" }}>Докупити</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
              {recipe.need.map((n, i) => (
                <span key={i} style={{ fontSize: "13px", background: `${COLORS.terracotta}1A`, color: COLORS.terracottaDark, padding: "5px 11px", borderRadius: "10px", fontWeight: 500 }}>
                  {n}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />
      <button onClick={onCook} style={{ ...btnPrimary, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
        <ChefHat size={18} /> Почати готувати
      </button>
    </div>
  );
}

function fmtTime(s) {
  if (s === null || s === undefined) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function CookingScreen({ recipe, index, onNext, onPrev, onExit, onFinish, timerSeconds, timerRunning, toggleTimer }) {
  const steps = recipe.steps || [];
  const step = steps[index];
  const isLast = index === steps.length - 1;

  if (!step) return null;

  return (
    <div style={{ minHeight: "600px", display: "flex", flexDirection: "column", padding: "22px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onExit} style={iconBtn}><X size={19} /></button>
        <span style={{ fontSize: "13px", color: COLORS.muted, fontWeight: 500 }}>{index + 1} / {steps.length}</span>
      </div>

      <div style={{ display: "flex", gap: "5px", margin: "16px 0 auto" }}>
        {steps.map((_, i) => (
          <div key={i} style={{ height: "4px", flex: 1, borderRadius: "2px", background: i <= index ? COLORS.terracotta : COLORS.line }} />
        ))}
      </div>

      <div key={index} className="fs-fade" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", padding: "20px 0" }}>
        <p className="fs-display" style={{ fontSize: "13px", fontWeight: 700, color: COLORS.terracotta, textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 14px" }}>
          {step.title}
        </p>
        <p className="fs-display" style={{ fontSize: "24px", fontWeight: 500, lineHeight: 1.4, margin: 0 }}>
          {step.description}
        </p>

        {timerSeconds !== null && (
          <button
            onClick={toggleTimer}
            style={{
              margin: "32px auto 0",
              background: timerRunning ? COLORS.terracotta : "#fff",
              color: timerRunning ? "#fff" : COLORS.ink,
              border: `1.5px solid ${COLORS.terracotta}`,
              borderRadius: "16px",
              padding: "14px 28px",
              fontSize: "22px",
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <Clock size={20} /> {fmtTime(timerSeconds)}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        {index > 0 && (
          <button onClick={onPrev} style={{ ...btnGhost, flex: "0 0 auto", padding: "15px 18px" }}>
            <ChevronLeft size={19} />
          </button>
        )}
        {isLast ? (
          <button onClick={onFinish} style={{ ...btnPrimary, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <Check size={18} /> Готово, смачного!
          </button>
        ) : (
          <button onClick={onNext} style={{ ...btnPrimary, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            Наступний крок <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

const btnPrimary = {
  background: COLORS.terracotta,
  color: "#fff",
  border: "none",
  borderRadius: "16px",
  padding: "16px 24px",
  fontSize: "15.5px",
  fontWeight: 600,
  fontFamily: "'Inter', sans-serif",
  cursor: "pointer",
};

const btnGhost = {
  background: "#fff",
  color: COLORS.ink,
  border: `1.5px solid ${COLORS.line}`,
  borderRadius: "16px",
  padding: "14px 24px",
  fontSize: "14.5px",
  fontWeight: 600,
  fontFamily: "'Inter', sans-serif",
  cursor: "pointer",
};

const iconBtn = {
  background: "#fff",
  border: `1px solid ${COLORS.line}`,
  borderRadius: "12px",
  width: "38px",
  height: "38px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: COLORS.ink,
};
