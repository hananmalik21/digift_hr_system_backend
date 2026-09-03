/**
 * Named status-group service (consolidation / process configuration).
 * Oracle owns all business rules.
 */

import { outcomeFromResultJson } from './payrollResultJson.js';

export function createStatusGroupService(model, labels) {
  return {
    async listGroups(payload) {
      const pkg = await model.listGroups(payload);
      return outcomeFromResultJson(pkg, {
        successMessage: `${labels.plural} retrieved successfully.`,
        asList: true
      });
    },

    async getGroup(payload) {
      const pkg = await model.getGroup(payload);
      return outcomeFromResultJson(pkg, {
        successMessage: `${labels.singular} retrieved successfully.`
      });
    },

    async createGroup(payload) {
      const pkg = await model.createGroup(payload);
      return outcomeFromResultJson(pkg, {
        successMessage: `${labels.singular} created successfully.`,
        successHttpStatus: 201
      });
    },

    async updateGroup(payload) {
      const pkg = await model.updateGroup(payload);
      return outcomeFromResultJson(pkg, {
        successMessage: `${labels.singular} updated successfully.`
      });
    },

    async setGroupStatus(payload) {
      const pkg = await model.setStatus(payload);
      return outcomeFromResultJson(pkg, {
        successMessage: `${labels.singular} status updated successfully.`
      });
    },

    async deleteGroup(payload) {
      const pkg = await model.deleteGroup(payload);
      return outcomeFromResultJson(pkg, {
        successMessage: `${labels.singular} deleted successfully.`
      });
    }
  };
}
