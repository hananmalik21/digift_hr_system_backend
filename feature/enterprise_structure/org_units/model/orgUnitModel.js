import {
  entActorPayload,
  entCreateRecord,
  entDeleteRecord,
  entGetRecord,
  entInvokeAction,
  entListEnvelope,
  entListRecords,
  entUpdateRecord,
  rethrowEntError
} from '../../shared/entModelBridge.js';

/**
 * Thin org-unit model — reads/writes via ORG_UNITS_PKG; tree build stays in Node (presentation).
 */
class OrgUnitModel {
  static guidToHex(guid) {
    if (Buffer.isBuffer(guid)) return guid.toString('hex').toUpperCase();
    if (typeof guid === 'string') return guid.toUpperCase();
    return String(guid).toUpperCase();
  }

  static attachParentUnit(row) {
    if (!row) return row;

    // Enforce ENT.ORG_UNITS business rule on the Node response boundary:
    // legal_employer and currency_code are COMPANY-only fields.
    const levelCodeRaw = row.level_code ?? row.LEVEL_CODE;
    const hasLevelCode = levelCodeRaw !== undefined && levelCodeRaw !== null && String(levelCodeRaw).trim() !== '';
    if (hasLevelCode) {
      const isCompanyLevel = String(levelCodeRaw).trim().toUpperCase() === 'COMPANY';
      if (!isCompanyLevel) {
        row.legal_employer = null;
        row.currency_code = null;
        delete row.LEGAL_EMPLOYER;
        delete row.CURRENCY_CODE;
      }
    }

    if (row.parent_unit) return row;
    const parentId = row.parent_org_unit_id ?? null;
    if (!parentId) return { ...row, parent_unit: null };
    return {
      ...row,
      parent_unit: {
        id: parentId,
        name: row.parent_org_unit_name_en || row.parent_org_unit_name_ar || null,
        level: row.parent_org_level_code || null
      }
    };
  }

  static toListPayload(structureId, filters = {}) {
    const payload = { structure_id: this.guidToHex(structureId) };
    if (filters.levelCode) payload.level_code = filters.levelCode;
    if (filters.parentId) payload.parent_org_unit_id = this.guidToHex(filters.parentId);
    if (filters.search) payload.search = filters.search;
    if (filters.isActive !== undefined) {
      payload.is_active = filters.isActive === true || filters.isActive === 'Y' ? 'Y' : 'N';
    }
    if (filters.pagination?.page) payload.page = filters.pagination.page;
    if (filters.pagination?.pageSize) payload.page_size = filters.pagination.pageSize;
    return payload;
  }

  static toPackagePayload(structureId, enterpriseId, data, userId) {
    const parent = data.parent_org_unit_id ?? data.PARENT_ORG_UNIT_ID;
    return entActorPayload(data, userId, {
      structure_id: structureId ? this.guidToHex(structureId) : undefined,
      enterprise_id: enterpriseId,
      level_code: data.level_code ?? data.LEVEL_CODE,
      org_unit_code: data.org_unit_code ?? data.ORG_UNIT_CODE,
      org_unit_name_en: data.org_unit_name_en ?? data.ORG_UNIT_NAME_EN,
      org_unit_name_ar: data.org_unit_name_ar ?? data.ORG_UNIT_NAME_AR,
      parent_org_unit_id: parent ? this.guidToHex(parent) : (parent === null ? null : undefined),
      is_active: data.is_active ?? data.IS_ACTIVE,
      // Legal employer / currency are COMPANY-only fields in ENT.ORG_UNITS.
      legal_employer: data.legal_employer ?? data.LEGAL_EMPLOYER,
      currency_code: data.currency_code ?? data.CURRENCY_CODE,
      manager_name: data.manager_name ?? data.MANAGER_NAME,
      manager_email: data.manager_email ?? data.MANAGER_EMAIL,
      manager_phone: data.manager_phone ?? data.MANAGER_PHONE,
      location: data.location ?? data.LOCATION,
      city: data.city ?? data.CITY,
      address: data.address ?? data.ADDRESS,
      description: data.description ?? data.DESCRIPTION,
      last_update_login: data.last_update_login ?? data.LAST_UPDATE_LOGIN
    });
  }

  static async findByStructureAndLevel(structureId, levelCode, filters = {}) {
    try {
      const payload = this.toListPayload(structureId, {
        ...filters,
        levelCode: levelCode
      });
      const { rows, total } = await entListEnvelope('ORG_UNITS', payload);
      const orgUnits = rows.map((r) => this.attachParentUnit(r));
      if (filters.pagination?.page && filters.pagination?.pageSize) {
        return { orgUnits, total };
      }
      return orgUnits;
    } catch (error) {
      throw new Error(`Failed to fetch org units: ${error.message}`);
    }
  }

  static async findParentOptions(structureId, parentLevelCode, filters = {}) {
    try {
      const payload = {
        structure_id: this.guidToHex(structureId),
        parent_level_code: parentLevelCode,
        search: filters.search,
        page: filters.pagination?.page,
        page_size: filters.pagination?.pageSize
      };
      const result = await entInvokeAction('ORG_UNITS', 'PARENT_OPTIONS', payload);
      const options = Array.isArray(result?.data) ? result.data : [];
      const totalCount = result?.total ?? options.length;
      if (filters.pagination?.page && filters.pagination?.pageSize) {
        return { orgUnits: options, total: totalCount };
      }
      return options;
    } catch (error) {
      throw new Error(`Failed to fetch parent options: ${error.message}`);
    }
  }

  static async findParentOptionsInOneQuery(structureId, childLevelCode, filters = {}) {
    if (!filters.pagination?.page || !filters.pagination?.pageSize) {
      throw new Error('findParentOptionsInOneQuery requires pagination');
    }
    try {
      const result = await entInvokeAction('ORG_UNITS', 'PARENT_OPTIONS_RESOLVE', {
        structure_id: this.guidToHex(structureId),
        child_level_code: childLevelCode,
        search: filters.search,
        page: filters.pagination.page,
        page_size: filters.pagination.pageSize
      });
      return {
        structExists: result?.struct_exists ?? 0,
        isActive: result?.is_active ?? null,
        childLevelFound: result?.child_level_found ?? 0,
        parentLevelCode: result?.parent_level_code ?? null,
        orgUnits: result?.org_units ?? [],
        total: result?.total ?? 0
      };
    } catch (error) {
      throw new Error(`Failed to fetch parent options: ${error.message}`);
    }
  }

  static async findById(orgUnitId, structureId = null) {
    try {
      const row = await entGetRecord('ORG_UNITS', {
        org_unit_id: this.guidToHex(orgUnitId),
        structure_id: structureId ? this.guidToHex(structureId) : undefined
      });
      return row ? this.attachParentUnit(row) : null;
    } catch (error) {
      throw new Error(`Failed to fetch org unit: ${error.message}`);
    }
  }

  static async findAllByStructure(structureId) {
    try {
      const rows = await entListRecords('ORG_UNITS', { structure_id: this.guidToHex(structureId) });
      return rows.map((r) => this.attachParentUnit(r));
    } catch (error) {
      throw new Error(`Failed to fetch org units: ${error.message}`);
    }
  }

  static async findActiveByStructure(structureId) {
    try {
      const result = await entInvokeAction('ORG_UNITS', 'LIST_ACTIVE', {
        structure_id: this.guidToHex(structureId)
      });
      return Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
    } catch (error) {
      throw new Error(`Failed to fetch active org units: ${error.message}`);
    }
  }

  static toMinimalData(orgUnit) {
    if (!orgUnit) return null;
    const levelCodeRaw = orgUnit.level_code || orgUnit.LEVEL_CODE;
    const hasLevelCode = levelCodeRaw !== undefined && levelCodeRaw !== null && String(levelCodeRaw).trim() !== '';
    const isCompanyLevel = hasLevelCode && String(levelCodeRaw).trim().toUpperCase() === 'COMPANY';
    return {
      org_unit_id: orgUnit.org_unit_id || orgUnit.ORG_UNIT_ID,
      org_unit_code: orgUnit.org_unit_code || orgUnit.ORG_UNIT_CODE,
      org_unit_name_en: orgUnit.org_unit_name_en || orgUnit.ORG_UNIT_NAME_EN,
      org_unit_name_ar: orgUnit.org_unit_name_ar || orgUnit.ORG_UNIT_NAME_AR,
      level_code: orgUnit.level_code || orgUnit.LEVEL_CODE,
      legal_employer: isCompanyLevel
        ? (orgUnit.legal_employer ?? orgUnit.LEGAL_EMPLOYER ?? null)
        : (hasLevelCode ? null : (orgUnit.legal_employer ?? orgUnit.LEGAL_EMPLOYER ?? null)),
      currency_code: isCompanyLevel
        ? (orgUnit.currency_code ?? orgUnit.CURRENCY_CODE ?? null)
        : (hasLevelCode ? null : (orgUnit.currency_code ?? orgUnit.CURRENCY_CODE ?? null)),
      parent_org_unit_id: orgUnit.parent_org_unit_id || orgUnit.PARENT_ORG_UNIT_ID || null,
      is_active: orgUnit.is_active || orgUnit.IS_ACTIVE
    };
  }

  static async create(structureId, enterpriseId, data, userId) {
    try {
      const levelCode = data.level_code || data.LEVEL_CODE;
      const orgUnitCode = data.org_unit_code || data.ORG_UNIT_CODE;
      const orgUnitNameEn = data.org_unit_name_en || data.ORG_UNIT_NAME_EN;
      if (!levelCode?.trim()) throw new Error('LEVEL_CODE is required and cannot be empty');
      if (!orgUnitCode?.trim()) throw new Error('ORG_UNIT_CODE is required and cannot be empty');
      if (!orgUnitNameEn?.trim()) throw new Error('ORG_UNIT_NAME_EN is required and cannot be empty');
      const row = await entCreateRecord('ORG_UNITS', this.toPackagePayload(structureId, enterpriseId, data, userId));
      return this.attachParentUnit(row);
    } catch (error) {
      rethrowEntError(error, 'Failed to create org unit');
    }
  }

  static async update(orgUnitId, structureId, data, userId) {
    try {
      const payload = { ...data };
      delete payload.parent_org_unit_id;
      delete payload.PARENT_ORG_UNIT_ID;
      const parent = data.parent_org_unit_id ?? data.PARENT_ORG_UNIT_ID;
      const row = await entUpdateRecord('ORG_UNITS', {
        ...this.toPackagePayload(structureId, null, payload, userId),
        org_unit_id: this.guidToHex(orgUnitId),
        structure_id: this.guidToHex(structureId),
        ...(parent !== undefined ? { parent_org_unit_id: parent ? this.guidToHex(parent) : null } : {})
      });
      return this.attachParentUnit(row);
    } catch (error) {
      rethrowEntError(error, 'Failed to update org unit');
    }
  }

  static async softDelete(orgUnitId, structureId, userId) {
    try {
      await entUpdateRecord('ORG_UNITS', {
        org_unit_id: this.guidToHex(orgUnitId),
        structure_id: this.guidToHex(structureId),
        is_active: 'N',
        actor: userId || 'SYSTEM'
      });
      return true;
    } catch (error) {
      rethrowEntError(error, 'Failed to delete org unit');
    }
  }

  static async hardDelete(orgUnitId, structureId) {
    try {
      return await entDeleteRecord('ORG_UNITS', {
        org_unit_id: this.guidToHex(orgUnitId),
        structure_id: this.guidToHex(structureId)
      }, { hard: true });
    } catch (error) {
      rethrowEntError(error, 'Failed to delete org unit');
    }
  }

  static buildTree(orgUnits) {
    const unitMap = new Map();
    const roots = [];
    orgUnits.forEach((unit) => {
      const unitId = unit.org_unit_id || unit.ORG_UNIT_ID;
      unitMap.set(unitId, { ...unit, children: [] });
    });
    orgUnits.forEach((unit) => {
      const unitId = unit.org_unit_id || unit.ORG_UNIT_ID;
      const parentId = unit.parent_unit?.id ?? unit.parent_org_unit_id ?? unit.PARENT_ORG_UNIT_ID ?? null;
      if (parentId && unitMap.has(parentId)) {
        unitMap.get(parentId).children.push(unitMap.get(unitId));
      } else {
        roots.push(unitMap.get(unitId));
      }
    });
    return roots;
  }

  static buildMinimalTree(orgUnits) {
    const unitMap = new Map();
    const roots = [];
    const normalizeId = (id) => {
      if (!id) return null;
      if (Buffer.isBuffer(id)) return id.toString('hex').toUpperCase();
      return String(id).toUpperCase().trim();
    };
    orgUnits.forEach((unit) => {
      const minimal = this.toMinimalData(unit);
      if (!minimal) return;
      const unitId = normalizeId(minimal.org_unit_id);
      if (unitId) unitMap.set(unitId, { ...minimal, org_unit_id: unitId, children: [] });
    });
    orgUnits.forEach((unit) => {
      const minimal = this.toMinimalData(unit);
      if (!minimal) return;
      const unitId = normalizeId(minimal.org_unit_id);
      const parentId = normalizeId(minimal.parent_org_unit_id);
      if (!unitId) return;
      if (parentId && unitMap.has(parentId)) {
        unitMap.get(parentId).children.push(unitMap.get(unitId));
      } else {
        roots.push(unitMap.get(unitId));
      }
    });
    return roots;
  }

  static async findParentHierarchyByEnterprise(enterpriseId, orgUnitIdHex32) {
    const result = await entInvokeAction('ORG_UNITS', 'PARENT_HIERARCHY', {
      enterprise_id: Number(enterpriseId),
      org_unit_id: this.guidToHex(orgUnitIdHex32)
    });
    return Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
  }
}

export default OrgUnitModel;
