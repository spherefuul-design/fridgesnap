export const metadata = {
  title: "FridgeSnap",
  description: "Сфотографуй холодильник — отримай 3 рецепти за 10 секунд",
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <body style={{ margin: 0, background: "#FAF6F0", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 0" }}>
        {children}
      </body>
    </html>
  );
}
