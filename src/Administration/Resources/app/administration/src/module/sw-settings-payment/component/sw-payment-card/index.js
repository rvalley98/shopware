import template from './sw-payment-card.html.twig';
import './sw-payment-card.scss';

/**
 * @package checkout
 */
// eslint-disable-next-line sw-deprecation-rules/private-feature-declarations
export default {
    template,

    compatConfig: Shopware.compatConfig,

    inject: ['acl'],

    emits: ['set-payment-active'],

    props: {
        paymentMethod: {
            type: Object,
            required: true,
        },
    },

    computed: {
        previewUrl() {
            return this.paymentMethod.media ? this.paymentMethod.media.url : null;
        },
    },

    methods: {
        async setPaymentMethodActive(active) {
            this.paymentMethod.active = active;

            this.$emit('set-payment-active', this.paymentMethod);
        },
    },
};
