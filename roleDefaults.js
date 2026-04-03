function normalizeRoleList(roles) {
    if (!Array.isArray(roles)) return [];

    const seen = new Set();
    const normalized = [];

    roles.forEach((role) => {
        const value = String(role ?? '').trim();
        if (!value) return;

        const key = value.toLowerCase();
        if (seen.has(key)) return;

        seen.add(key);
        normalized.push(value);
    });

    return normalized;
}

function deriveDefaultTankRoles(roles) {
    return normalizeRoleList(roles).filter((role) => /tank/i.test(role));
}

function deriveDefaultCarryRoles(roles) {
    const normalizedRoles = normalizeRoleList(roles);
    const tankRoleKeys = new Set(
        deriveDefaultTankRoles(normalizedRoles).map((role) => role.toLowerCase())
    );

    return normalizedRoles.filter((role) => {
        const roleKey = role.toLowerCase();
        return roleKey !== 'unknown' && !tankRoleKeys.has(roleKey);
    });
}

const roleDefaults = {
    deriveDefaultTankRoles,
    deriveDefaultCarryRoles
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = roleDefaults;
}

if (typeof window !== 'undefined') {
    window.roleDefaults = roleDefaults;
}
