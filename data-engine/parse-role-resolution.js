module.exports = {
    _resolveRoleName({
        cleanName,
        rawName,
        roleId,
        hashDictionary,
        championReference,
        setOverrides
    }) {
        const roleOverrides = setOverrides.roleOverrides || {};
        const roleOverride = roleOverrides[cleanName] || roleOverrides[rawName] || null;
        if (roleOverride) return roleOverride;

        const hashedRole = hashDictionary[roleId];
        if (hashedRole && hashedRole !== 'Unknown') return hashedRole;

        const referenceRole = championReference?.record?.role;
        if (referenceRole && referenceRole !== 'Unknown') return referenceRole;

        return 'Unknown';
    },

    _deriveStableVariantRole(baseRole, variants) {
        if (baseRole && baseRole !== 'Unknown') {
            return baseRole;
        }

        const variantRoles = [...new Set(
            (variants || [])
                .map((variant) => variant?.role)
                .filter((roleName) => roleName && roleName !== 'Unknown')
        )];

        if (variantRoles.length !== 1) {
            return baseRole;
        }

        const [variantRole] = variantRoles;
        const allVariantsMatch = (variants || []).every((variant) => variant?.role === variantRole);
        return allVariantsMatch ? variantRole : baseRole;
    }
};
