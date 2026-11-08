import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";

const EXTENSION_ID = "com.onze1onze.sistema-iniciativa";
const ITEM_KEY = EXTENSION_ID + "/combatant";

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

OBR.onReady(async () => {
  try {
    await OBR.contextMenu.create({
      id: EXTENSION_ID + "/token-menu",
      icons: [
        {
          icon: "/Sistema-Iniciativa/icons/toggle.svg",
          label: "Alternar na iniciativa",
          filter: { every: [{ key: "layer", value: "CHARACTER" }] }
        }
      ],
      onClick(context) {
        const validItems = context.items.filter((item) => item.layer === "CHARACTER" && item.type === "IMAGE");
        if (!validItems.length) return;
        const ids = validItems.map((item) => item.id);
        void OBR.scene.items.updateItems(ids, (items) => {
          for (const item of items) {
            item.metadata = item.metadata || {};
            if (item.metadata[ITEM_KEY]) {
              delete item.metadata[ITEM_KEY];
            } else {
              item.metadata[ITEM_KEY] = {
                initiative: rollD20(),
                displayName: item.name || "Combatente",
                conditions: [],
                note: "",
                addedAt: Date.now()
              };
            }
          }
        }).catch((error) => console.error("Sistema Iniciativa:", error));
      }
    });
  } catch (error) {
    console.error("Não foi possível registrar o menu contextual:", error);
  }
});