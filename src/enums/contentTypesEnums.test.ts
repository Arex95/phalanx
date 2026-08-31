import { describe, expect, it } from 'vitest';
import { ContentTypeEnum } from './contentTypesEnums';

describe('ContentTypeEnum', () => {
    it('has the expected values for every content type', () => {
        expect(ContentTypeEnum.JSON).toBe('application/json;charset=UTF-8');
        expect(ContentTypeEnum.FORM_URLENCODED).toBe('application/x-www-form-urlencoded;charset=UTF-8');
        expect(ContentTypeEnum.FORM_DATA).toBe('multipart/form-data;charset=UTF-8');
        expect(ContentTypeEnum.TEXT_PLAIN).toBe('text/plain;charset=UTF-8');
        expect(ContentTypeEnum.XML).toBe('application/xml;charset=UTF-8');
        expect(ContentTypeEnum.HTML).toBe('text/html;charset=UTF-8');
        expect(ContentTypeEnum.JS).toBe('application/javascript;charset=UTF-8');
        expect(ContentTypeEnum.CSV).toBe('text/csv;charset=UTF-8');
        expect(ContentTypeEnum.PDF).toBe('application/pdf');
        expect(ContentTypeEnum.OCTET_STREAM).toBe('application/octet-stream');
    });
});
