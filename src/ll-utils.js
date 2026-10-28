export function getLLBuild(build) {
  return {
    id: build.id,
    userid: build.properties?.userid.rich_text[0].plain_text || null,
    name: build.properties?.name.title[0].plain_text || null,
    health: build.properties?.health.number || 0,
    shield: build.properties?.shield.number || 0,
    race: build.properties?.race.number || 0,
    level: build.properties?.level.number || 0,
    core: build.properties?.core.rich_text[0].plain_text || null,
    class: build.properties?.class.rich_text[0].plain_text || null,
    skill: build.properties?.skill.rich_text[0].plain_text || null,
    ability: build.properties?.ability.rich_text[0].plain_text || null,
    element: build.properties?.element.rich_text[0].plain_text || null,
    equipment: build.properties?.equipment.rich_text[0].plain_text || null,
    filter: build.properties?.filter.rich_text[0].plain_text || null,
    cooldown: build.properties?.cooldown.rich_text[0].plain_text || null,
    artifact: build.properties?.artifact.rich_text[0].plain_text || null,
    trinket: build.properties?.trinket.rich_text[0].plain_text || null,
    set: build.properties?.set.rich_text[0].plain_text || null,
    item: build.properties?.item.rich_text[0].plain_text || null,
    buff: build.properties?.buff.rich_text[0].plain_text || null,
    note: build.properties?.note.rich_text[0].plain_text || null,
    setting: build.properties?.setting.rich_text[0].plain_text || null,
  };
}

export function getPropertiesObject(data) {
  return {
    name: {
      title: [
        {
          text: {
            content: data.name,
          },
        },
      ],
    },
    userid: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.userid, link: null },
        },
      ],
    },
    health: {
      number: data.health,
    },
    shield: {
      number: data.shield,
    },
    race: {
      number: data.race,
    },
    level: {
      number: data.level,
    },
    core: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.core, link: null },
        },
      ],
    },
    class: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.class, link: null },
        },
      ],
    },
    skill: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.skill, link: null },
        },
      ],
    },
    ability: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.ability, link: null },
        },
      ],
    },
    element: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.element, link: null },
        },
      ],
    },
    equipment: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.equipment, link: null },
        },
      ],
    },
    filter: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.filter, link: null },
        },
      ],
    },
    cooldown: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.cooldown, link: null },
        },
      ],
    },
    artifact: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.artifact, link: null },
        },
      ],
    },
    trinket: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.trinket, link: null },
        },
      ],
    },
    set: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.set, link: null },
        },
      ],
    },
    item: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.item, link: null },
        },
      ],
    },
    buff: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.buff, link: null },
        },
      ],
    },
    note: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.note, link: null },
        },
      ],
    },
    setting: {
      type: "rich_text",
      rich_text: [
        {
          type: "text",
          text: { content: data.setting, link: null },
        },
      ],
    },
  };
}
