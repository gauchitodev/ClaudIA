import { updateUser } from "../database-functions.js";

let plugin = (m) => m;
plugin.before = async function (m, { client, user }) {
  if (!m.isGroup || !m.message) return;
  const groupData = user.inGroup[m.chat];

  if (typeof groupData.messageCount !== "number") {
    groupData.messageCount = 0;
  }

  groupData.messageCount += 1;

  updateUser(m.sender, {
    inGroup: JSON.stringify(user.inGroup),
  });

  return;
};

export default plugin;
